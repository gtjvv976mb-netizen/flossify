import UIKit
import WebKit
import CoreHaptics
import SafariServices
import QuickLook
import Capacitor

// The Flossify app's native layer, around the live website (https://flossify.ph, capacitor.config.json server.url).
// The website's half is src/components/app-shell.js, which loads only in this app (src/components/AppShell.astro).
//
// - FlossifyViewController: the iOS feel a web view lacks. The edge swipe goes back, the page bounces, pull to refresh
//   reloads (unless a form on the page holds typed words), the keyboard follows the finger down, and the colour behind
//   the page and the status bar follow the page's theme.
// - FlossifyShellPlugin (`FlossifyShell` in the page): haptics, printing on the right paper, and saving a file the page
//   made itself (the QR poster PNG, an .ics for the calendar).
// - NavigationProxy: a download (a CSV export, a patient's file, a blob the page made) is saved and offered in the share
//   sheet, where Capacitor would fail the load and show the offline page. A cancelled load (a link tapped twice) no
//   longer shows the offline page either.
// - UIProxy and PageSheetController: a link the website opens in a new tab (a prescription to print, the X-ray viewer,
//   the privacy notice) opens in a sheet over the page with the same sign-in, so nothing typed on the page underneath is
//   lost, and a swipe down closes it. A link to another website opens in an in-app Safari view. A long press on a
//   picture has no menu, so a patient's X-ray is never saved to Photos from it.
//
// Haptics follow Apple's guidance: a tick for a choice, a light tap for the main action and for opening something,
// success, warning and error for outcomes, and a few Core Haptics patterns for the moments that matter most (a card
// lifted and dropped on the calendar, a visit booked or a consent signed, a refusal). Nothing buzzes for decoration.

/// The website's hosts. The host the app is set to open (capacitor.config.json server.url: flossify.ph, or localhost
/// when the app is pointed at a website on this Mac) is added at start, so a sheet opens there too.
var flossifyHosts: Set<String> = ["flossify.ph", "www.flossify.ph"]

/// An http or https address: a page of a website, not the app's own offline page (capacitor://…).
func isWebPage(_ url: URL?) -> Bool {
    let scheme = url?.scheme?.lowercased()
    return scheme == "https" || scheme == "http"
}

// MARK: - Haptics

final class FlossifyHaptics {
    static let shared = FlossifyHaptics()

    private let light = UIImpactFeedbackGenerator(style: .light)
    private let medium = UIImpactFeedbackGenerator(style: .medium)
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)
    private let soft = UIImpactFeedbackGenerator(style: .soft)
    private let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private let selection = UISelectionFeedbackGenerator()
    private let notification = UINotificationFeedbackGenerator()

    private var engine: CHHapticEngine?
    private let supportsCoreHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics

    private init() {
        prepare()
    }

    /// Wakes the Taptic Engine so the next feedback lands without delay.
    func prepare() {
        [light, medium, heavy, soft, rigid].forEach { $0.prepare() }
        selection.prepare()
        notification.prepare()
    }

    func impact(_ style: String, intensity: CGFloat? = nil) {
        let generator: UIImpactFeedbackGenerator
        switch style {
        case "medium": generator = medium
        case "heavy": generator = heavy
        case "soft": generator = soft
        case "rigid": generator = rigid
        default: generator = light
        }
        if let intensity = intensity {
            generator.impactOccurred(intensity: max(0, min(1, intensity)))
        } else {
            generator.impactOccurred()
        }
        generator.prepare()
    }

    func select() {
        selection.selectionChanged()
        selection.prepare()
    }

    func notify(_ type: String) {
        switch type {
        case "error": notification.notificationOccurred(.error)
        case "warning": notification.notificationOccurred(.warning)
        default: notification.notificationOccurred(.success)
        }
        notification.prepare()
    }

    /// The named patterns. Without Core Haptics (older phones) each falls back to the nearest plain feedback.
    func play(_ name: String) {
        guard supportsCoreHaptics, let pattern = Self.pattern(name) else {
            fallback(name)
            return
        }
        do {
            let engine = try startedEngine()
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {
            // The engine is stopped while the app is in the background, and can fail to start again: a new one next time.
            engine = nil
            fallback(name)
        }
    }

    /// The nearest plain feedback for each pattern (no Core Haptics, or it failed).
    private func fallback(_ name: String) {
        switch name {
        case "lift": impact("soft")
        case "drop": impact("rigid")
        case "confirm": notify("success")
        case "refuse": notify("error")
        default: impact("light")
        }
    }

    private func startedEngine() throws -> CHHapticEngine {
        if let engine = engine {
            try engine.start() // a no-op when it is running; wakes it after the app was in the background
            return engine
        }
        let made = try CHHapticEngine()
        made.isAutoShutdownEnabled = true
        made.playsHapticsOnly = true
        made.resetHandler = { [weak made] in try? made?.start() }
        try made.start()
        engine = made
        return made
    }

    private static func tap(_ time: TimeInterval, intensity: Float, sharpness: Float) -> CHHapticEvent {
        CHHapticEvent(eventType: .hapticTransient, parameters: [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
        ], relativeTime: time)
    }

    private static func swell(_ time: TimeInterval, duration: TimeInterval, intensity: Float, sharpness: Float) -> CHHapticEvent {
        CHHapticEvent(eventType: .hapticContinuous, parameters: [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness),
        ], relativeTime: time, duration: duration)
    }

    private static func pattern(_ name: String) -> CHHapticPattern? {
        var events: [CHHapticEvent] = []
        var curves: [CHHapticParameterCurve] = []
        switch name {
        case "lift":
            // A card picked up: a soft swell, then a light catch.
            events = [swell(0, duration: 0.07, intensity: 0.35, sharpness: 0.2), tap(0.07, intensity: 0.5, sharpness: 0.35)]
        case "drop":
            // Put down: a firm tap, and a small settle after it.
            events = [tap(0, intensity: 0.9, sharpness: 0.55), tap(0.07, intensity: 0.3, sharpness: 0.2)]
        case "confirm":
            // A visit booked, a consent signed, a payment taken: two rising taps and a short bloom that fades.
            events = [tap(0, intensity: 0.45, sharpness: 0.3), tap(0.09, intensity: 0.85, sharpness: 0.5),
                      swell(0.12, duration: 0.24, intensity: 0.32, sharpness: 0.15)]
            curves = [CHHapticParameterCurve(parameterID: .hapticIntensityControl, controlPoints: [
                CHHapticParameterCurve.ControlPoint(relativeTime: 0.12, value: 1),
                CHHapticParameterCurve.ControlPoint(relativeTime: 0.36, value: 0),
            ], relativeTime: 0)]
        case "refuse":
            // Not allowed: two quick, firm knocks.
            events = [tap(0, intensity: 0.8, sharpness: 0.75), tap(0.11, intensity: 0.8, sharpness: 0.75)]
        default:
            return nil
        }
        return try? CHHapticPattern(events: events, parameterCurves: curves)
    }
}

// MARK: - Printing on the paper the page is drawn for

/// The page says its paper (its CSS @page size, read by app-shell.js) in points; the print sheet starts on the printer's
/// nearest paper, so an A5 prescription is not laid out on the top half of an A4 sheet and a receipt fits the roll.
final class FlossifyPrinter: NSObject, UIPrintInteractionControllerDelegate {
    static let shared = FlossifyPrinter()
    private var paperSize: CGSize?

    func print(_ webView: WKWebView, from controller: UIViewController, jobName: String, paper: CGSize?,
               completion: @escaping (Bool) -> Void) {
        paperSize = paper
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = jobName
        let printer = UIPrintInteractionController.shared
        printer.printInfo = info
        printer.delegate = self
        printer.printFormatter = webView.viewPrintFormatter()
        let done: UIPrintInteractionController.CompletionHandler = { _, completed, _ in completion(completed) }
        if controller.traitCollection.userInterfaceIdiom == .pad {
            let view = controller.view!
            let anchor = CGRect(x: view.bounds.midX, y: view.safeAreaInsets.top + 44, width: 1, height: 1)
            printer.present(from: anchor, in: view, animated: true, completionHandler: done)
        } else {
            printer.present(animated: true, completionHandler: done)
        }
    }

    func printInteractionController(_ printInteractionController: UIPrintInteractionController,
                                    choosePaper paperList: [UIPrintPaper]) -> UIPrintPaper {
        // With no paper named by the page, A4: not the printer's first paper, which can be a 4x6 photo card.
        UIPrintPaper.bestPaper(forPageSize: paperSize ?? CGSize(width: 595.28, height: 841.89), withPapersFrom: paperList)
    }
}

// MARK: - Saving and sharing files

/// Files go to the app's temporary folder, protected while the phone is locked, and are deleted once the share sheet
/// closes (and any left over, at the next start). A file from the server (a patient's X-ray, an export) is never offered
/// to Photos or the clipboard; every other place the share sheet lists (Files, AirDrop, Print, Mail, Messages, a chat
/// app) can receive it, as a download in a browser could.
enum FlossifyFiles {
    static let folder = FileManager.default.temporaryDirectory.appendingPathComponent("flossify-files", isDirectory: true)
    private static var previews: [QuickLookSource] = []

    static func clearAll() {
        try? FileManager.default.removeItem(at: folder)
    }

    /// A new folder of its own for each file, so the file keeps the name the page gave it.
    static func newFileURL(named name: String) throws -> URL {
        let own = folder.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: own, withIntermediateDirectories: true,
                                                attributes: [.protectionKey: FileProtectionType.complete])
        return own.appendingPathComponent(safeFilename(name))
    }

    static func safeFilename(_ name: String) -> String {
        let banned = CharacterSet(charactersIn: "/\\:?%*|\"<>\u{0}").union(.newlines).union(.controlCharacters)
        let cleaned = name.components(separatedBy: banned).joined(separator: "-").trimmingCharacters(in: .whitespaces)
        let trimmed = String(cleaned.prefix(120))
        return trimmed.isEmpty || trimmed.hasPrefix(".") ? "Flossify file" : trimmed
    }

    /// `madeByPage`: a file the page drew itself (the QR poster), which may go to Photos. A file from the server (a
    /// patient's X-ray, an export) may not, nor to the clipboard.
    static func share(_ url: URL, from controller: UIViewController, madeByPage: Bool, completion: ((Bool) -> Void)? = nil) {
        let folder = url.deletingLastPathComponent()
        // Nothing on screen to show it over (the sheet that asked has closed): the file goes at once.
        guard let presenter = topmost(from: controller) else {
            try? FileManager.default.removeItem(at: folder)
            completion?(false)
            return
        }
        if url.pathExtension.lowercased() == "ics" {
            preview(url, from: presenter, completion: completion)
            return
        }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        var excluded: [UIActivity.ActivityType] = [.assignToContact, .postToFacebook, .postToTwitter, .postToWeibo,
                                                   .postToTencentWeibo, .postToFlickr, .postToVimeo, .addToReadingList]
        // A file from the server (a patient's X-ray, an export) does not go to Photos or the clipboard (which reaches the
        // person's other devices). Which other apps may receive it is the owner's call (docs/features/ios-app.md).
        if !madeByPage { excluded.append(contentsOf: [.saveToCameraRoll, .copyToPasteboard]) }
        sheet.excludedActivityTypes = excluded
        var finished = false
        sheet.completionWithItemsHandler = { activity, completed, _, _ in
            // Cancelling inside Mail or Messages calls this with the share sheet still open; it is called again when
            // the sheet closes. Only that last call (or a finished share) ends it, once.
            guard !finished, completed || activity == nil else { return }
            finished = true
            if completed { FlossifyHaptics.shared.notify("success") }
            try? FileManager.default.removeItem(at: folder)
            completion?(completed)
        }
        if let popover = sheet.popoverPresentationController {
            let view = presenter.view!
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.maxY - view.safeAreaInsets.bottom - 44, width: 1, height: 1)
            popover.permittedArrowDirections = [.down, .up]
        }
        presenter.present(sheet, animated: true)
    }

    /// The controller on top of `controller` (a sheet, a Safari view), so what is shown next is never refused because
    /// something is already showing. Nil when `controller` is no longer on screen.
    static func topmost(from controller: UIViewController) -> UIViewController? {
        guard controller.viewIfLoaded?.window != nil else { return nil }
        var top = controller
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        return top
    }

    /// An .ics (Add to calendar on a booking or My visits) opens in iOS's preview, which offers Add to Calendar.
    private static func preview(_ url: URL, from controller: UIViewController, completion: ((Bool) -> Void)?) {
        let source = QuickLookSource(url: url) { source in
            previews.removeAll { $0 === source }
            try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
            completion?(true)
        }
        previews.append(source)
        let ql = QLPreviewController()
        ql.dataSource = source
        ql.delegate = source
        controller.present(ql, animated: true)
    }
}

final class QuickLookSource: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
    private let url: URL
    private let onClose: (QuickLookSource) -> Void
    init(url: URL, onClose: @escaping (QuickLookSource) -> Void) {
        self.url = url
        self.onClose = onClose
    }
    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url as NSURL }
    func previewControllerDidDismiss(_ controller: QLPreviewController) { onClose(self) }
}

// MARK: - The bridge's calls, shared by the main page and a sheet

/// What `FlossifyShell.<method>` does, for whichever web view asked. Returns the answer, or nil to reject.
enum FlossifyCalls {
    static func perform(_ method: String, _ options: [String: Any], webView: WKWebView, from controller: UIViewController,
                        reply: @escaping ([String: Any]?, String?) -> Void) {
        let haptics = FlossifyHaptics.shared
        switch method {
        case "impact":
            haptics.impact(options["style"] as? String ?? "light", intensity: (options["intensity"] as? NSNumber).map { CGFloat($0.doubleValue) })
            reply([:], nil)
        case "selection":
            haptics.select()
            reply([:], nil)
        case "notify":
            haptics.notify(options["type"] as? String ?? "success")
            reply([:], nil)
        case "pattern":
            haptics.play(options["name"] as? String ?? "")
            reply([:], nil)
        case "prepare":
            haptics.prepare()
            reply([:], nil)
        case "ready":
            reply([:], nil)
        case "textSize":
            // The person's text size (Settings, Larger Text), for a page that asks before the app has told it.
            reply(["percent": FlossifyViewController.textPercent(for: controller.traitCollection)], nil)
        case "print":
            var paper: CGSize?
            if let w = options["paperWidth"] as? NSNumber, let h = options["paperHeight"] as? NSNumber, w.doubleValue > 0, h.doubleValue > 0 {
                paper = CGSize(width: w.doubleValue, height: h.doubleValue)
            }
            FlossifyPrinter.shared.print(webView, from: controller, jobName: options["jobName"] as? String ?? "Flossify", paper: paper) { done in
                reply(["printed": done], nil)
            }
        case "saveFile":
            guard let base64 = options["data"] as? String, let data = Data(base64Encoded: base64) else {
                reply(nil, "No file data")
                return
            }
            guard data.count <= 30 * 1024 * 1024 else {
                reply(nil, "The file is too large to save from the app")
                return
            }
            do {
                let url = try FlossifyFiles.newFileURL(named: options["filename"] as? String ?? "Flossify file")
                try data.write(to: url, options: .completeFileProtection)
                // The page says whether it drew the file itself (a blob: or data: link): only then may it go to Photos.
                let madeByPage = (options["madeByPage"] as? Bool) ?? false
                FlossifyFiles.share(url, from: controller, madeByPage: madeByPage) { saved in reply(["saved": saved], nil) }
            } catch {
                reply(nil, "The file could not be saved")
            }
        default:
            reply(nil, "Unknown method \(method)")
        }
    }
}

// MARK: - The line at the top while a page is on its way

/// A web view has no address bar, so nothing says a tap was taken while the next page is on its way. This is the thin
/// teal line at the top edge (never at the foot): it shows only once a load has been in flight for a quarter of a
/// second, so a fast page never flashes it, follows the web view's own progress, and fades when the page is in. While
/// a file downloads it slides from side to side instead, since a download reports no length worth trusting.
final class LoadBar: UIView {
    static let height: CGFloat = 2

    /// True while another cue already shows this load (pull to refresh's spinner): one load, one cue.
    var isHeldBack: (() -> Bool)?

    private let fill = UIView()
    private var watches: [NSKeyValueObservation] = []
    private var activeWatch: NSObjectProtocol?
    private var wait: DispatchWorkItem?
    private var busyWait: DispatchWorkItem?
    private var shown = false
    private var sliding = false
    private var target: CGFloat = 0
    private var laidOutWidth: CGFloat = 0

    init() {
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        clipsToBounds = true
        alpha = 0
        fill.backgroundColor = FlossifyViewController.tint
        addSubview(fill)
        // iOS drops a repeating animation when the app steps back: start the slide again on the way in.
        activeWatch = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil,
                                                             queue: .main) { [weak self] _ in
            if self?.sliding == true { self?.slide() }
        }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    deinit {
        if let activeWatch = activeWatch { NotificationCenter.default.removeObserver(activeWatch) }
    }

    func watch(_ webView: WKWebView) {
        watches = [
            webView.observe(\.isLoading, options: [.new]) { [weak self] web, _ in self?.loadingChanged(web) },
            webView.observe(\.estimatedProgress, options: [.new]) { [weak self] web, _ in self?.progressChanged(web) },
        ]
    }

    func stopWatching() {
        watches = []
        wait?.cancel()
        busyWait?.cancel()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // A turned iPad: the line keeps its share of the new width.
        guard bounds.width != laidOutWidth else { return }
        laidOutWidth = bounds.width
        if sliding { slide() } else { fill.frame = CGRect(x: 0, y: 0, width: bounds.width * target, height: bounds.height) }
    }

    private func loadingChanged(_ web: WKWebView) {
        if web.isLoading {
            guard wait == nil, !shown, !sliding else { return }
            let item = DispatchWorkItem { [weak self, weak web] in
                guard let self = self else { return }
                self.wait = nil
                guard let web = web, web.isLoading, !self.sliding, !(self.isHeldBack?() ?? false) else { return }
                self.begin(at: max(0.1, CGFloat(web.estimatedProgress)))
            }
            wait = item
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25, execute: item)
        } else {
            wait?.cancel()
            wait = nil
            if shown { finish() }
        }
    }

    private func progressChanged(_ web: WKWebView) {
        let progress = CGFloat(web.estimatedProgress)
        guard shown, !sliding, progress > target else { return }
        run(to: progress, in: 0.3)
    }

    private func run(to share: CGFloat, in duration: TimeInterval, then: (() -> Void)? = nil) {
        target = share
        UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseOut, .beginFromCurrentState], animations: {
            self.fill.frame = CGRect(x: 0, y: 0, width: self.bounds.width * share, height: self.bounds.height)
        }, completion: { done in if done { then?() } })
    }

    private func begin(at share: CGFloat) {
        shown = true
        layer.removeAllAnimations()
        fill.layer.removeAllAnimations()
        fill.frame = CGRect(x: 0, y: 0, width: 0, height: bounds.height)
        UIView.animate(withDuration: 0.15, delay: 0, options: [.beginFromCurrentState]) { self.alpha = 1 }
        // To where the page has got, then creeping on while the server is still to answer, so it never looks stuck.
        run(to: share, in: 0.3) { [weak self] in
            guard let self = self, self.shown, !self.sliding, self.target < 0.6 else { return }
            self.run(to: 0.6, in: 8)
        }
    }

    /// The page is in (or its load ended): to the full width, then gone. Out faster than in.
    private func finish() {
        shown = false
        run(to: 1, in: 0.18)
        UIView.animate(withDuration: 0.22, delay: 0.16, options: [.curveEaseOut, .beginFromCurrentState], animations: {
            self.alpha = 0
        }, completion: { [weak self] _ in
            guard let self = self, !self.shown, !self.sliding else { return }
            self.target = 0
            self.fill.frame = CGRect(x: 0, y: 0, width: 0, height: self.bounds.height)
        })
    }

    /// A download is running (true) or none is (false). Shown only when one has run for nearly half a second, so a
    /// small file does not flash it.
    func setBusy(_ busy: Bool) {
        busyWait?.cancel()
        busyWait = nil
        if busy {
            guard !sliding else { return }
            let item = DispatchWorkItem { [weak self] in
                guard let self = self else { return }
                self.busyWait = nil
                self.sliding = true
                self.shown = false
                self.layer.removeAllAnimations()
                UIView.animate(withDuration: 0.15, delay: 0, options: [.beginFromCurrentState]) { self.alpha = 1 }
                self.slide()
            }
            busyWait = item
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: item)
        } else if sliding {
            sliding = false
            UIView.animate(withDuration: 0.2, delay: 0, options: [.curveEaseOut, .beginFromCurrentState], animations: {
                self.alpha = 0
            }, completion: { [weak self] _ in
                guard let self = self, !self.shown, !self.sliding else { return }
                self.fill.layer.removeAllAnimations()
                self.target = 0
                self.fill.frame = CGRect(x: 0, y: 0, width: 0, height: self.bounds.height)
            })
        }
    }

    private func slide() {
        fill.layer.removeAllAnimations()
        let width = bounds.width * 0.3
        fill.frame = CGRect(x: -width, y: 0, width: width, height: bounds.height)
        UIView.animate(withDuration: 1.1, delay: 0, options: [.curveEaseInOut, .repeat], animations: {
            self.fill.frame = CGRect(x: self.bounds.width, y: 0, width: width, height: self.bounds.height)
        })
    }
}

// MARK: - Pull to refresh's spinner, clear of the camera

/// The page starts at the very top of the screen (capacitor.config.json, contentInset "never"), so iOS's own refresh
/// spinner is drawn in the gap the pull opens there: behind the Dynamic Island or the notch. This small round card sits
/// just under the status bar instead, grows with the pull, spins while the page reloads and shrinks away at the end.
final class RefreshChip: UIView {
    static let size: CGFloat = 36

    private let spinner = UIActivityIndicatorView(style: .medium)
    private var offsetWatch: NSKeyValueObservation?
    private enum Stage { case idle, spinning, leaving }
    private var stage = Stage.idle
    /// False while there is no refresh to pull (something is drawn over the page): the page still bounces, unmarked.
    var follows = true

    init() {
        super.init(frame: CGRect(x: 0, y: 0, width: Self.size, height: Self.size))
        isUserInteractionEnabled = false
        isAccessibilityElement = false
        alpha = 0
        // The soft template's card and hairline (#fff on #e6e9ee; #1d232a on #2c343e in the dark).
        backgroundColor = UIColor { $0.userInterfaceStyle == .dark
            ? UIColor(red: 0x1d / 255, green: 0x23 / 255, blue: 0x2a / 255, alpha: 1) : .white }
        layer.cornerRadius = Self.size / 2
        layer.borderWidth = 1
        layer.shadowColor = UIColor(red: 16 / 255, green: 24 / 255, blue: 40 / 255, alpha: 1).cgColor
        layer.shadowOpacity = 0.08
        layer.shadowRadius = 3
        layer.shadowOffset = CGSize(width: 0, height: 1)
        spinner.hidesWhenStopped = false
        spinner.color = FlossifyViewController.tint
        spinner.center = CGPoint(x: Self.size / 2, y: Self.size / 2)
        addSubview(spinner)
        paintHairline()
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (chip: RefreshChip, _: UITraitCollection) in chip.paintHairline() }
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    private func paintHairline() {
        let hairline = UIColor { $0.userInterfaceStyle == .dark
            ? UIColor(red: 0x2c / 255, green: 0x34 / 255, blue: 0x3e / 255, alpha: 1)
            : UIColor(red: 0xe6 / 255, green: 0xe9 / 255, blue: 0xee / 255, alpha: 1) }
        layer.borderColor = hairline.resolvedColor(with: traitCollection).cgColor
    }

    /// Grows with the finger: nothing at rest, whole once the page has been pulled far enough to let go.
    func follow(_ scrollView: UIScrollView) {
        offsetWatch = scrollView.observe(\.contentOffset, options: [.new]) { [weak self] scroll, _ in
            guard let self = self else { return }
            let pull = max(0, -(scroll.contentOffset.y + scroll.adjustedContentInset.top))
            switch self.stage {
            case .spinning: return
            case .leaving:
                if pull <= 0.5 { self.stage = .idle }
            case .idle:
                guard self.follows else { return }
                let share = min(1, pull / 64)
                self.alpha = share
                let size = 0.6 + 0.4 * share
                self.transform = CGAffineTransform(scaleX: size, y: size)
            }
        }
    }

    func spin() {
        stage = .spinning
        spinner.startAnimating()
        UIView.animate(withDuration: 0.2, delay: 0, options: [.curveEaseOut, .beginFromCurrentState]) {
            self.alpha = 1
            self.transform = .identity
        }
    }

    func stop() {
        guard stage == .spinning else { return }
        stage = .leaving
        UIView.animate(withDuration: 0.18, delay: 0, options: [.curveEaseIn, .beginFromCurrentState], animations: {
            self.alpha = 0
            self.transform = CGAffineTransform(scaleX: 0.6, y: 0.6)
        }, completion: { _ in self.spinner.stopAnimating() })
    }

    /// Something is drawn over the page, or the pull was let go for nothing: gone at once.
    func hide() {
        guard stage != .spinning else { return }
        alpha = 0
    }
}

// MARK: - The view controller

final class FlossifyViewController: CAPBridgeViewController {
    private let refresh = UIRefreshControl()
    private let refreshChip = RefreshChip()
    private let loadBar = LoadBar()
    private var navigationProxy: NavigationProxy?
    private var uiProxy: UIProxy?
    private var refreshTimeout: DispatchWorkItem?
    private var observers: [NSObjectProtocol] = []
    private var cover: UIView?
    /// The address of the page on screen, from the last navigation the web view committed.
    private(set) var currentPath = "/"
    /// The website's page the person is on: `currentPath`, or, on the app's own offline page, the page under it (the
    /// one the failed load left behind). A clinic tablet that lost its line is still a clinic tablet.
    private var websitePath = "/"
    /// What the page says (src/components/app-shell.js, setChrome): false while something is drawn over it (a panel, the drawer,
    /// a consent turned to the patient), where a sideways drag belongs to that.
    var pageAllowsSwipe = true
    /// What the page says (setChrome's `overlay`): a panel, drawer, dialog or pop-over is open. A pull then belongs to
    /// it and never reloads the page from under it. A page that does not say is taken at its word on the swipe.
    var pageHasOverlay: Bool?
    var pageIsDark = false
    /// The launch screen, kept over the web view until the page has drawn itself (showLaunchCover).
    private var launchCover: UIView?
    private var launchMark: UIImageView?
    private var launchBreathes = false
    private var revealed = false
    /// A page has been committed since the app started (the launch screen never lifts onto an empty web view).
    private var committedOnce = false
    /// When the app last stepped back, to tell a long time away from a glance at another app.
    private var leftAt: Date?
    /// Counts the times the app itself went somewhere, so an answer that comes back late is not acted on.
    private var moves = 0
    /// The page the app is fetching afresh by itself (cameBack): if that one load cannot start, nothing is said or felt.
    private var quietReload: URL?
    /// A Home Screen quick action the app was started with (SceneDelegate): opened in place of the start page.
    var startPath: String?

    /// The soft template's page colours (#f3f5f8 light, #15191e dark): behind the page while it loads and when it bounces.
    static let lightPage = UIColor(red: 0xf3 / 255, green: 0xf5 / 255, blue: 0xf8 / 255, alpha: 1)
    static let darkPage = UIColor(red: 0x15 / 255, green: 0x19 / 255, blue: 0x1e / 255, alpha: 1)
    /// The teal that is filled (a button's ground, under white words): the same in both themes, as on the website.
    static let teal = UIColor(red: 0x0e / 255, green: 0x74 / 255, blue: 0x71 / 255, alpha: 1)
    /// The teal for words and thin marks (Done, an alert's buttons, the spinner, the line at the top). #0e7471 on a dark
    /// sheet is about 3:1, so in the dark it is the website's own pale teal (#98e3dc, --c-accent-deep), about 11:1.
    static let tint = UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(red: 0x98 / 255, green: 0xe3 / 255, blue: 0xdc / 255, alpha: 1) : teal }
    /// The soft template's words (ink and ink-2), for the few the app draws itself. Slate, never black.
    static let ink = UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(red: 0xe7 / 255, green: 0xeb / 255, blue: 0xf0 / 255, alpha: 1)
        : UIColor(red: 0x1f / 255, green: 0x29 / 255, blue: 0x37 / 255, alpha: 1) }
    static let ink2 = UIColor { $0.userInterfaceStyle == .dark
        ? UIColor(red: 0xc3 / 255, green: 0xca / 255, blue: 0xd4 / 255, alpha: 1)
        : UIColor(red: 0x47 / 255, green: 0x54 / 255, blue: 0x67 / 255, alpha: 1) }

    override func capacitorDidLoad() {
        FlossifyFiles.clearAll()
        Self.keepOutOfBackups()
        let plugin = FlossifyShellPlugin()
        plugin.owner = self
        bridge?.registerPluginInstance(plugin)
        if let host = bridge?.config.serverURL.host?.lowercased() { flossifyHosts.insert(host) }

        guard let webView = webView else { return }
        setPageColor(UIColor { $0.userInterfaceStyle == .dark ? Self.darkPage : Self.lightPage })

        // iOS's own feel: the edge swipe goes back and forward, the page bounces, the keyboard follows the finger.
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.bounces = true
        webView.scrollView.alwaysBounceVertical = true
        webView.scrollView.keyboardDismissMode = .interactive
        webView.allowsLinkPreview = false

        // iOS's own spinner would turn behind the Dynamic Island (RefreshChip): it is kept for the gesture, unseen.
        refresh.tintColor = .clear
        refresh.addTarget(self, action: #selector(pulled), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        view.addSubview(refreshChip)
        refreshChip.follow(webView.scrollView)

        loadBar.isHeldBack = { [weak self] in self?.refresh.isRefreshing ?? false }
        loadBar.watch(webView)
        view.addSubview(loadBar)
        showLaunchCover()

        let navigation = NavigationProxy(target: webView.navigationDelegate, presenter: self)
        navigation.onLoadEnded = { [weak self] in self?.endRefreshing() }
        navigation.onCommit = { [weak self] url in self?.arrived(at: url) }
        // A page without the app's script (the app's own offline page) never says it is ready: its load ending does.
        navigation.onFinish = { [weak self] in
            self?.reveal(after: 0.6)
            self?.tellTextSize()
        }
        navigation.onStartFailed = { [weak self] error, answer in
            guard let self = self else { answer(false); return }
            // The app's own reload after a long time away (cameBack): nobody tapped anything, so its failure is not
            // told or felt, and the page on screen, which WebKit has left alive, stays. Only for that page's own load:
            // a link tapped in the meantime cancels the reload, and its failure is the person's to hear about.
            if let quiet = self.quietReload {
                self.quietReload = nil
                if (error.userInfo[NSURLErrorFailingURLErrorKey] as? URL) == quiet { answer(true); return }
            }
            self.lineFailed(error, answer)
        }
        navigation.onDownloads = { [weak self] running in self?.loadBar.setBusy(running > 0) }
        navigation.onTerminated = { [weak self] in
            // Capacitor reloads the page; with no page yet there is nothing to reload, and the screen would stay empty.
            guard let self = self, let webView = self.webView, webView.url == nil,
                  let start = self.bridge?.config.appStartServerURL else { return }
            webView.load(URLRequest(url: start))
        }
        navigationProxy = navigation
        webView.navigationDelegate = navigation

        let ui = UIProxy(target: webView.uiDelegate, presenter: self)
        uiProxy = ui
        webView.uiDelegate = ui

        // The app switcher keeps a picture of the screen on the device: a record, a patient's answers or a Treatment
        // record must not be in it. Covered as the app steps back, uncovered as it returns.
        let centre = NotificationCenter.default
        observers.append(centre.addObserver(forName: UIScene.willDeactivateNotification, object: nil, queue: .main) { [weak self] _ in
            self?.coverIfPrivate()
        })
        observers.append(centre.addObserver(forName: UIScene.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
            self?.leftAt = Date()
        })
        observers.append(centre.addObserver(forName: UIScene.didActivateNotification, object: nil, queue: .main) { [weak self] _ in
            self?.uncover()
            self?.cameBack()
        })
        // Larger Text (Settings): the page is told the person's text size, now and whenever they change it.
        observers.append(centre.addObserver(forName: UIContentSizeCategory.didChangeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.tellTextSize()
        })
        // A tap on the status bar scrolls a page to its top by itself. A panel that fills the screen scrolls inside
        // itself, where iOS cannot reach: the page is told, and scrolls whatever is on top (app-shell.js, scrollTop).
        observers.append(centre.addObserver(forName: .capacitorStatusBarTapped, object: nil, queue: .main) { [weak self] _ in
            self?.webView?.evaluateJavaScript("window.flossifyApp && window.flossifyApp.scrollTop && window.flossifyApp.scrollTop(), true")
        })
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // Started from a Home Screen quick action: that page, in place of the start page Capacitor has just asked for.
        if let path = startPath, let url = ownURL(path) {
            startPath = nil
            webView?.load(URLRequest(url: url))
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        placeTopMarks()
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        placeTopMarks()
    }

    /// The line sits in the last 2 pt under the clock, just above the page's own bar; the refresh card just below it.
    private func placeTopMarks() {
        let top = view.safeAreaInsets.top
        loadBar.frame = CGRect(x: 0, y: max(0, top - LoadBar.height), width: view.bounds.width, height: LoadBar.height)
        refreshChip.center = CGPoint(x: view.bounds.midX, y: top + 6 + RefreshChip.size / 2)
    }

    // MARK: The launch screen

    /// The launch screen (Assets: Splash, as LaunchScreen.storyboard shows it) stays over the web view until the page
    /// has drawn itself: the page says so (FlossifyShell.ready, from the app's script), or, for a page without that script
    /// (the offline page), its load has finished. Never on a timer before that: measured in the simulator, a web view
    /// uncovered while its first page was still on its way (Capacitor's splash screen, whose own timer ran out after 4 s
    /// on a slow line) stayed blank.
    ///
    /// A still picture for many seconds reads as a frozen app, so on a slow line it shows it is alive: after a moment the
    /// mark breathes, and after 8 s a line of words says the app is still loading. After 30 s it lifts whatever
    /// happened, but never onto an empty web view: with no page yet, the app's own offline page is shown instead.
    private func showLaunchCover() {
        let page = UIColor { $0.userInterfaceStyle == .dark ? Self.darkPage : Self.lightPage }
        let cover = UIView(frame: view.bounds)
        cover.backgroundColor = page
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.clipsToBounds = true
        cover.isUserInteractionEnabled = true // nothing under it is tapped before it is seen
        let mark = UIImageView(image: UIImage(named: "Splash"))
        mark.contentMode = .scaleAspectFill
        mark.frame = cover.bounds
        mark.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.addSubview(mark)
        // VoiceOver: the cover is what there is to read, and the half-loaded page under it is not.
        cover.isAccessibilityElement = true
        cover.accessibilityLabel = "Flossify is loading"
        cover.accessibilityViewIsModal = true
        view.addSubview(cover)
        launchCover = cover
        launchMark = mark
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            self?.launchBreathes = true
            self?.breathe()
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in self?.sayStillLoading() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in self?.launchTimedOut() }
    }

    /// The mark grows and settles, slowly, for as long as the launch screen is up. (The picture is the whole screen in
    /// the page's colour with the mark in the middle, so only the mark is seen to move.)
    private func breathe() {
        guard launchBreathes, launchCover != nil, let mark = launchMark else { return }
        mark.layer.removeAllAnimations()
        mark.transform = .identity
        UIView.animate(withDuration: 1.2, delay: 0, options: [.curveEaseInOut, .repeat, .autoreverse], animations: {
            mark.transform = CGAffineTransform(scaleX: 1.06, y: 1.06)
        })
    }

    private func sayStillLoading() {
        guard let cover = launchCover else { return }
        let words = UILabel()
        words.text = "Still loading…"
        words.font = UIFontMetrics(forTextStyle: .subheadline).scaledFont(for: .systemFont(ofSize: 15, weight: .medium))
        words.adjustsFontForContentSizeCategory = true
        words.textColor = Self.ink2
        words.textAlignment = .center
        words.numberOfLines = 0
        words.alpha = 0
        words.translatesAutoresizingMaskIntoConstraints = false
        cover.addSubview(words)
        // Under the mark: the picture is 2732 px square, filled to the longer side, and the mark is 240 px of it.
        let markHalf = 120 * max(cover.bounds.width, cover.bounds.height) / 2732
        NSLayoutConstraint.activate([
            words.topAnchor.constraint(equalTo: cover.centerYAnchor, constant: markHalf * 1.06 + 20),
            words.leadingAnchor.constraint(equalTo: cover.leadingAnchor, constant: 24),
            words.trailingAnchor.constraint(equalTo: cover.trailingAnchor, constant: -24),
        ])
        UIView.animate(withDuration: 0.3, delay: 0, options: [.curveEaseOut]) { words.alpha = 1 }
        cover.accessibilityLabel = "Flossify is still loading"
        if UIAccessibility.isVoiceOverRunning { UIAccessibility.post(notification: .announcement, argument: "Still loading") }
    }

    private func launchTimedOut() {
        guard !revealed else { return }
        guard !committedOnce, let webView = webView, let offline = bridge?.config.errorPathURL else {
            reveal()
            return
        }
        // Nothing has arrived in 30 s: the app's own offline page (it says it is ready, and the cover lifts), where
        // Try again and a pull both start again. Should even that not draw, the cover still lifts.
        webView.stopLoading()
        webView.load(URLRequest(url: offline))
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in self?.reveal() }
    }

    /// Lifts the launch screen, once: it fades as the mark rises a little, on iOS's own curve.
    func reveal(after delay: TimeInterval = 0) {
        guard !revealed else { return }
        if delay > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.reveal() }
            return
        }
        revealed = true
        guard let cover = launchCover else { return }
        let mark = launchMark
        launchCover = nil
        launchMark = nil
        // From where the breathing has it, so the mark does not jump.
        var size: CGFloat = 1
        if let mark = mark, let now = mark.layer.presentation() {
            size = now.affineTransform().a
            mark.layer.removeAllAnimations()
            mark.transform = CGAffineTransform(scaleX: size, y: size)
        }
        let curve = UICubicTimingParameters(controlPoint1: CGPoint(x: 0.32, y: 0.72), controlPoint2: CGPoint(x: 0, y: 1))
        let lift = UIViewPropertyAnimator(duration: 0.42, timingParameters: curve)
        lift.addAnimations {
            cover.alpha = 0
            mark?.transform = CGAffineTransform(scaleX: size + 0.05, y: size + 0.05)
        }
        lift.addCompletion { [weak self] _ in
            cover.removeFromSuperview()
            if UIAccessibility.isVoiceOverRunning { UIAccessibility.post(notification: .screenChanged, argument: self?.webView) }
        }
        lift.startAnimation()
    }

    // MARK: Where the page is

    /// A page where the edge swipe must never go back: a sign-in page (the page behind may be the last person's), a page
    /// a patient holds (the desk's device handed over, a clinic tablet, signing on the tablet), the patients' door.
    static func guarded(_ path: String) -> Bool {
        path.hasPrefix("/auth/") || path.hasPrefix("/f/") || path.contains("/sign/") || path.hasSuffix("/sign-in/")
            || path == "/me/" || path.hasPrefix("/me/code")
    }

    /// A page a patient holds (a clinic tablet, the desk's device handed over, signing): the app itself never takes it
    /// anywhere else (a Home Screen quick action).
    static func heldByPatient(_ path: String) -> Bool {
        path.hasPrefix("/f/") || path.contains("/sign/")
    }

    /// A page the screen stays awake on: a clinic tablet waiting for the next patient, a device handed to a patient.
    static func keepsAwake(_ path: String) -> Bool {
        path.hasPrefix("/f/t/") || path.hasPrefix("/f/i/")
    }

    /// A page the app switcher must not keep a picture of.
    static func isPrivate(_ path: String) -> Bool {
        ["/c/", "/f/", "/me/", "/admin/"].contains { path.hasPrefix($0) }
    }

    /// URL.path drops the closing slash the site's addresses carry; put it back so "/me/" reads as "/me/".
    static func sitePath(_ url: URL?) -> String {
        var path = url?.path ?? ""
        if path.isEmpty { path = "/" }
        if !path.hasSuffix("/") && !path.contains(".") { path += "/" }
        return path
    }

    /// The last page of a website in the back list: under the app's own offline page, the page the person was on.
    private var lastWebsitePage: WKBackForwardListItem? {
        webView?.backForwardList.backList.last { isWebPage($0.url) }
    }

    func arrived(at url: URL?) {
        committedOnce = true
        quietReload = nil
        currentPath = Self.sitePath(url)
        // On the app's own offline page, the page that failed to load is still the page the person is on.
        websitePath = isWebPage(url) ? currentPath : (lastWebsitePage.map { Self.sitePath($0.url) } ?? currentPath)
        pageAllowsSwipe = true
        pageHasOverlay = nil
        applySwipe()
        UIApplication.shared.isIdleTimerDisabled = Self.keepsAwake(websitePath)
    }

    /// Something is drawn over the page (as the page says; a page that does not say `overlay` says it with the swipe).
    private var overlayOpen: Bool { pageHasOverlay ?? !pageAllowsSwipe }

    /// The page behind is a door (a sign-in page, the patients' code page): once through it, a swipe back would only
    /// show the door again, with the last person's number on it, so there is no going back onto it. Only once through:
    /// every door leads into a private page, and a public page reached from a door's own links (Find a clinic from My
    /// visits' door) keeps its swipe back, since nobody has signed in.
    private var doorBehind: Bool {
        guard let behind = webView?.backForwardList.backItem?.url, isWebPage(behind) else { return false }
        return Self.guarded(Self.sitePath(behind)) && Self.isPrivate(currentPath)
    }

    func applySwipe() {
        webView?.allowsBackForwardNavigationGestures = pageAllowsSwipe && !Self.guarded(currentPath) && !doorBehind
        // Over a panel, a drawer or a pop-over a pull belongs to that: there is no refresh to pull while one is open.
        // (Not changed in the middle of a reload: the spinner in flight ends by itself.)
        guard let scroll = webView?.scrollView, !refresh.isRefreshing else { return }
        let wanted: UIRefreshControl? = overlayOpen ? nil : refresh
        if scroll.refreshControl !== wanted {
            scroll.refreshControl = wanted
            refreshChip.follows = wanted != nil
            if wanted == nil { refreshChip.hide() }
        }
    }

    private func coverIfPrivate() {
        guard cover == nil, Self.isPrivate(currentPath), let window = view.window else { return }
        let shield = UIView(frame: window.bounds)
        shield.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        shield.backgroundColor = pageIsDark ? Self.darkPage : Self.lightPage
        // Hidden from the eye, so hidden from VoiceOver too (Control Centre pulled down over a record).
        shield.isAccessibilityElement = true
        shield.accessibilityLabel = "Flossify"
        shield.accessibilityViewIsModal = true
        // The splash's mark (Assets: Splash, light and dark), in the page's own theme.
        let mark = UIImageView(image: UIImage(named: "Splash"))
        mark.overrideUserInterfaceStyle = pageIsDark ? .dark : .light
        mark.contentMode = .scaleAspectFill
        mark.frame = shield.bounds
        mark.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        shield.addSubview(mark)
        window.addSubview(shield)
        cover = shield
    }

    private func uncover() {
        guard let shield = cover else { return }
        cover = nil
        UIView.animate(withDuration: 0.18, animations: { shield.alpha = 0 }, completion: { _ in shield.removeFromSuperview() })
    }

    /// The app is in front again. A page left open for half an hour or more is fetched afresh (yesterday's Dashboard, a
    /// record still drawn after the sign-in ran out), quietly: no haptic, since nobody did anything. Never a page that
    /// holds typed words, a page a patient holds or a sign-in page, never under an open panel or sheet, never a page
    /// that holds the swipe back (a booking part-way through its steps: leaving would lose what was chosen), and never
    /// with the line down (a page on screen is worth more than the offline page).
    private func cameBack() {
        breathe() // iOS dropped the launch screen's animation while the app was away
        guard let left = leftAt else { return }
        leftAt = nil
        guard Date().timeIntervalSince(left) >= 30 * 60, let webView = webView, isWebPage(webView.url), !webView.isLoading,
              !overlayOpen, pageAllowsSwipe, presentedViewController == nil, !Self.guarded(currentPath) else { return }
        let move = moves
        let ask = "navigator.onLine !== false && ((window.flossifyApp && window.flossifyApp.canRefresh) ? window.flossifyApp.canRefresh() === true : true)"
        webView.evaluateJavaScript(ask) { [weak self] result, _ in
            guard let self = self, move == self.moves, (result as? Bool) == true, let webView = self.webView,
                  !webView.isLoading, !self.overlayOpen, self.pageAllowsSwipe, self.presentedViewController == nil else { return }
            self.quietReload = webView.url
            webView.reload()
        }
    }

    /// What the web view keeps on the phone (its cookies, a kept record, chart changes waiting to be sent) stays on this
    /// phone: out of iCloud and computer backups, so a restored or new phone never carries a sign-in or a patient's data.
    /// (Nothing here deletes any of it: a chart change not yet sent lives there.)
    static func keepOutOfBackups() {
        let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
        for name in ["WebKit", "Cookies"] {
            var folder = library.appendingPathComponent(name, isDirectory: true)
            try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? folder.setResourceValues(values)
        }
    }

    func setPageColor(_ color: UIColor) {
        view.backgroundColor = color
        webView?.backgroundColor = color
        webView?.scrollView.backgroundColor = color
    }

    // MARK: A load that failed

    /// From the app's own offline page (Try again, a pull, the line coming back): to the page the person was on, which
    /// is the last website page in the back list (a failed load leaves the offline page on top of it, more than once
    /// when a retry failed too). With none (the very first load failed), the start page. On a website's page it does
    /// nothing: that page is the one to keep.
    func retry() {
        guard let webView = webView, !isWebPage(webView.url) else { return }
        moves += 1
        if let page = lastWebsitePage {
            webView.go(to: page)
        } else if let start = bridge?.config.appStartServerURL {
            webView.load(URLRequest(url: start))
        }
    }

    /// A page of ours is on screen and the next one could not start loading (the line dropped as a link was tapped or a
    /// form was sent). WebKit has left the page on screen alive, with what was typed on it: when the page can say so
    /// itself (app-shell.js, lineFailed), it is kept, where Capacitor would put the offline page in its place. The page
    /// is told whether anything can have reached the server: `false` when the phone had no line or never found the
    /// server, 'maybe' when the line dropped part-way (a timeout), since the form may have been saved. Answers true
    /// when the page was kept.
    private func lineFailed(_ error: NSError, _ answer: @escaping (Bool) -> Void) {
        guard error.domain == NSURLErrorDomain, let webView = webView,
              let here = webView.backForwardList.currentItem?.url, isWebPage(here),
              flossifyHosts.contains(here.host?.lowercased() ?? "") else {
            answer(false)
            return
        }
        let neverSent = [NSURLErrorNotConnectedToInternet, NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost,
                         NSURLErrorDNSLookupFailed].contains(error.code)
        let tell = "(window.flossifyApp && typeof window.flossifyApp.lineFailed === 'function') ? (window.flossifyApp.lineFailed(\(neverSent ? "false" : "'maybe'")), true) : false"
        webView.evaluateJavaScript(tell) { result, _ in answer((result as? Bool) == true) }
    }

    // MARK: Pull to refresh

    /// Pull to refresh: the page says first whether it may reload (it may not while a form holds typed words).
    @objc private func pulled() {
        // Under an open panel or drawer the pull was not for the page (applySwipe takes the control away; this is for
        // a pull already under way as one opened): nothing reloads, and nothing is said or felt.
        if overlayOpen {
            refresh.endRefreshing()
            refreshChip.hide()
            return
        }
        FlossifyHaptics.shared.impact("medium")
        refreshChip.spin()
        // On the app's own offline page (capacitor://…/offline.html) a reload would load it again: back to the page
        // the person was on.
        if !isWebPage(webView?.url) {
            retry()
            armRefreshTimeout()
            return
        }
        let ask = "(window.flossifyApp && window.flossifyApp.canRefresh) ? window.flossifyApp.canRefresh() : true"
        webView?.evaluateJavaScript(ask) { [weak self] result, _ in
            guard let self = self else { return }
            if let allowed = result as? Bool, allowed == false {
                self.endRefreshing()
                FlossifyHaptics.shared.notify("warning")
                self.webView?.evaluateJavaScript("window.flossifyApp && window.flossifyApp.refreshRefused && window.flossifyApp.refreshRefused()")
                return
            }
            self.moves += 1
            self.webView?.reload()
            self.armRefreshTimeout()
        }
    }

    /// The spinner always ends: at the load's end, or after 15 s.
    private func armRefreshTimeout() {
        refreshTimeout?.cancel()
        let timeout = DispatchWorkItem { [weak self] in self?.endRefreshing() }
        refreshTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: timeout)
    }

    func endRefreshing() {
        refreshTimeout?.cancel()
        refreshTimeout = nil
        if refresh.isRefreshing { refresh.endRefreshing() }
        refreshChip.stop()
        applySwipe() // a panel opened while the page reloaded
    }

    // MARK: Larger Text

    /// The person's text size as a percentage of the usual one (Settings, Display & Brightness, Text Size, and Larger
    /// Text under Accessibility): 100 at the default, kept between 85 and 135 so the page's layout holds.
    static func textPercent(for traits: UITraitCollection) -> Int {
        let scaled = UIFontMetrics.default.scaledValue(for: 100, compatibleWith: traits)
        return Int(min(135, max(85, scaled.rounded())))
    }

    func tellTextSize() {
        let percent = Self.textPercent(for: traitCollection)
        webView?.evaluateJavaScript("window.flossifyApp && window.flossifyApp.textSize && window.flossifyApp.textSize(\(percent)), true")
    }

    // MARK: Going somewhere the app chose

    /// An address on the website the app is set to open (flossify.ph; localhost when pointed at this Mac).
    func ownURL(_ path: String) -> URL? {
        guard let server = bridge?.config.serverURL,
              var parts = URLComponents(url: server, resolvingAgainstBaseURL: false) else { return nil }
        parts.path = path
        parts.query = nil
        parts.fragment = nil
        return parts.url
    }

    /// A Home Screen quick action, with the app already running. The same care as a pull to refresh, and more: never
    /// away from a page a patient holds, never from a page or a sheet holding typed words, never from under an alert
    /// or a share sheet. When it may not go, nothing happens: the page on screen is the one the person was working on.
    func open(path: String, completion: @escaping (Bool) -> Void) {
        guard isViewLoaded, let webView = webView, let url = ownURL(path), !Self.heldByPatient(websitePath) else {
            completion(false)
            return
        }
        var sheet: UIViewController?
        if let shown = presentedViewController {
            // A page in a sheet with nothing typed closes first; anything else on top stays, and so does the page.
            guard let nav = shown as? UINavigationController, nav.viewControllers.first is PageSheetController,
                  !nav.isModalInPresentation, nav.presentedViewController == nil else {
                completion(false)
                return
            }
            sheet = nav
        }
        let go = { [weak self] in
            self?.moves += 1
            self?.leftAt = nil
            if let sheet = sheet, sheet.presentingViewController != nil {
                sheet.dismiss(animated: true) { webView.load(URLRequest(url: url)) }
            } else {
                webView.load(URLRequest(url: url))
            }
            completion(true)
        }
        guard isWebPage(webView.url) else { go(); return }
        let ask = "(window.flossifyApp && window.flossifyApp.canRefresh) ? window.flossifyApp.canRefresh() : true"
        webView.evaluateJavaScript(ask) { result, _ in
            if let free = result as? Bool, free == false { completion(false) } else { go() }
        }
    }

    // MARK: VoiceOver

    /// VoiceOver's two-finger scrub (and Switch Control's and Voice Control's "go back"): the edge swipe is the app's
    /// only Back and VoiceOver takes that gesture for itself. The same rule as the swipe: not out of a sign-in page or
    /// a page a patient holds, and not while something is drawn over the page (its own Close is the way out there).
    override func accessibilityPerformEscape() -> Bool {
        guard let webView = webView, pageAllowsSwipe, !Self.guarded(currentPath), !doorBehind, webView.canGoBack else { return false }
        webView.goBack()
        return true
    }
}

// MARK: - The plugin the main page calls

@objc(FlossifyShellPlugin)
public class FlossifyShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FlossifyShellPlugin"
    public let jsName = "FlossifyShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "impact", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notify", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pattern", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setChrome", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ready", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "retry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "textSize", returnType: CAPPluginReturnPromise),
    ]

    weak var owner: FlossifyViewController?

    private func run(_ method: String, _ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let owner = self?.owner, let webView = owner.webView else { call.reject("No page"); return }
            FlossifyCalls.perform(method, call.options as? [String: Any] ?? [:], webView: webView, from: owner) { answer, problem in
                if let problem = problem { call.reject(problem) } else { call.resolve(answer ?? [:]) }
            }
        }
    }

    @objc func impact(_ call: CAPPluginCall) { run("impact", call) }
    @objc func selection(_ call: CAPPluginCall) { run("selection", call) }
    @objc func notify(_ call: CAPPluginCall) { run("notify", call) }
    @objc func pattern(_ call: CAPPluginCall) { run("pattern", call) }
    @objc func prepare(_ call: CAPPluginCall) { run("prepare", call) }
    @objc func print(_ call: CAPPluginCall) { run("print", call) }
    @objc func saveFile(_ call: CAPPluginCall) { run("saveFile", call) }
    @objc func textSize(_ call: CAPPluginCall) { run("textSize", call) }

    /// The app's own offline page (mobile/www/offline.html): Try again, or the line coming back. Back to the page the
    /// person was on.
    @objc func retry(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in self?.owner?.retry() }
        call.resolve()
    }

    /// The page has drawn itself (public: src/components/app-shell.js, at DOMContentLoaded): the launch screen goes.
    @objc func ready(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in self?.owner?.reveal(after: 0.05) }
        call.resolve()
    }

    /// The page's theme (the person's own choice, or the device's): the status bar's words and the colour behind the page.
    /// Whether a sideways drag may go back (not while something is drawn over the page), whether a panel, drawer,
    /// dialog or pop-over is open (`overlay`: no pull to refresh then), and the page's own ground colour. A key the
    /// app does not know is left alone.
    @objc func setChrome(_ call: CAPPluginCall) {
        let dark = call.getBool("dark") ?? false
        let ground = call.getString("color").flatMap(UIColor.init(flossifyHex:))
        let swipe = call.getBool("swipeBack")
        let overlay = call.getBool("overlay")
        let chosen = call.getString("theme")
        DispatchQueue.main.async { [weak self] in
            guard let owner = self?.owner else { return }
            owner.pageIsDark = dark
            // Alerts, pickers and sheets in the person's own choice of light or dark; following the device when they
            // chose nothing (an override then would also stop the page hearing the device change). A page that does
            // not know the choice (the app's own offline page sends no `theme`) leaves it as it was.
            if let chosen = chosen {
                owner.view.window?.overrideUserInterfaceStyle = chosen == "dark" ? .dark : chosen == "light" ? .light : .unspecified
            }
            owner.setStatusBarStyle(dark ? .lightContent : .darkContent)
            owner.setPageColor(ground ?? (dark ? FlossifyViewController.darkPage : FlossifyViewController.lightPage))
            if let swipe = swipe { owner.pageAllowsSwipe = swipe }
            if let overlay = overlay { owner.pageHasOverlay = overlay }
            if swipe != nil || overlay != nil { owner.applySwipe() }
        }
        call.resolve()
    }
}

// MARK: - Downloads, and loads that were only cancelled

/// Sits in front of a navigation delegate (Capacitor's, or none in a sheet): what it does not handle itself goes on.
final class NavigationProxy: NSObject, WKNavigationDelegate, WKDownloadDelegate {
    private weak var target: WKNavigationDelegate?
    private weak var presenter: UIViewController?
    private var destinations: [ObjectIdentifier: URL] = [:]
    var onLoadEnded: (() -> Void)?
    var onCommit: ((URL?) -> Void)?
    /// A sheet's: a link tapped inside it to another of our pages. True when the sheet took it elsewhere.
    var onLeave: ((URL) -> Bool)?
    /// A load that finished (not one that failed).
    var onFinish: (() -> Void)?
    /// A load that could not start (the line dropped, the server was not found). Answer true when the owner dealt with
    /// it; on false, or with no owner asking, it goes on to Capacitor, which shows the offline page.
    var onStartFailed: ((NSError, @escaping (Bool) -> Void) -> Void)?
    /// A page that failed part-way in, after it had begun to draw.
    var onFailed: ((NSError) -> Void)?
    /// The number of downloads running, each time it changes.
    var onDownloads: ((Int) -> Void)?
    /// A downloaded file, ready to share. True when the owner shares it itself (a sheet that never showed a page).
    var onDownloaded: ((URL, Bool) -> Bool)?
    /// A download that failed. True when the owner says so itself.
    var onDownloadFailed: (() -> Bool)?
    /// The web view's process was ended by iOS (memory): after Capacitor, if any, has reloaded the page.
    var onTerminated: (() -> Void)?
    private var running: Set<ObjectIdentifier> = []
    /// The web view a download was asked from, to tell its page when one fails.
    private weak var asker: WKWebView?

    init(target: WKNavigationDelegate?, presenter: UIViewController) {
        self.target = target
        self.presenter = presenter
        super.init()
    }

    override func responds(to aSelector: Selector!) -> Bool {
        if super.responds(to: aSelector) { return true }
        return target?.responds(to: aSelector) ?? false
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let target = target, target.responds(to: aSelector) { return target }
        return super.forwardingTarget(for: aSelector)
    }

    // A link the page marks as a download (a blob or data: link the page made, an <a download>) is downloaded here,
    // where Capacitor would hand it to iOS, which can open neither.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        // A form sent again by going back, forward or reloading (pull to refresh) would write again without anyone
        // pressing Save (a refused record post, sent again after the patient signed). Safari asks first; here nothing is
        // sent again, and the page is fetched afresh.
        if navigationAction.navigationType == .formResubmitted {
            decisionHandler(.cancel)
            guard let url = navigationAction.request.url, navigationAction.targetFrame?.isMainFrame ?? true else { return }
            // Decided on the next turn, once WebKit has put the back/forward list back on the page on screen.
            DispatchQueue.main.async {
                let list = webView.backForwardList
                if list.currentItem?.url == url {
                    // A reload of a form's answer (pull to refresh): the page fetched afresh, in place.
                    webView.load(URLRequest(url: url))
                } else if let i = list.backList.lastIndex(where: { $0.url == url }) {
                    // Back onto a form's answer: one step further back, so the gesture never loops there.
                    if i > 0 { webView.go(to: list.backList[i - 1]) }
                } else if let j = list.forwardList.firstIndex(where: { $0.url == url }), j + 1 < list.forwardList.count {
                    webView.go(to: list.forwardList[j + 1])
                }
            }
            return
        }
        // Never back or forward onto the app's own offline page: a failed load leaves it in the list (ahead of the page
        // once Try again worked), and a swipe would show "You're offline" with the line up. The app's own moves are
        // not these: the offline page is loaded, never travelled to, and retry only goes to a website's page.
        if navigationAction.navigationType == .backForward, navigationAction.targetFrame?.isMainFrame ?? true,
           !isWebPage(navigationAction.request.url) {
            decisionHandler(.cancel)
            return
        }
        if navigationAction.navigationType == .linkActivated, navigationAction.targetFrame?.isMainFrame ?? false,
           let url = navigationAction.request.url, let onLeave = onLeave, onLeave(url) {
            decisionHandler(.cancel)
            return
        }
        // The main page: Capacitor's own rules (its allowed hosts, other websites to iOS). `webView?(…)` is nil only when
        // the delegate does not implement the method.
        if let target = target, target.webView?(webView, decidePolicyFor: navigationAction, decisionHandler: decisionHandler) != nil {
            return
        }
        // A sheet has no Capacitor behind it: its own rule. Our site stays in the sheet; another site opens in Safari view.
        if let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() {
            if scheme == "http" || scheme == "https" {
                if let host = url.host?.lowercased(), !flossifyHosts.contains(host), navigationAction.targetFrame?.isMainFrame ?? true {
                    if let presenter = presenter { presenter.present(SFSafariViewController(url: url), animated: true) }
                    decisionHandler(.cancel)
                    return
                }
            } else if scheme != "about" && scheme != "blob" && scheme != "data" {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
        }
        decisionHandler(.allow)
    }

    // A response the page cannot show, or one the server sends as an attachment, becomes a download.
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let http = navigationResponse.response as? HTTPURLResponse,
           let disposition = http.value(forHTTPHeaderField: "Content-Disposition"),
           disposition.lowercased().trimmingCharacters(in: .whitespaces).hasPrefix("attachment") {
            decisionHandler(.download)
            return
        }
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        began(download, from: webView)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        began(download, from: webView)
    }

    private func began(_ download: WKDownload, from webView: WKWebView) {
        download.delegate = self
        asker = webView
        running.insert(ObjectIdentifier(download))
        onDownloads?(running.count)
    }

    private func ended(_ download: WKDownload) {
        guard running.remove(ObjectIdentifier(download)) != nil else { return }
        onDownloads?(running.count)
    }

    /// iOS ended the web view's process (memory). Capacitor reloads the main page; a sheet has no Capacitor behind it.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        CAPLog.print("⚡️  Flossify: the web view's process ended", webView.url?.absoluteString ?? "-")
        target?.webViewWebContentProcessDidTerminate?(webView)
        onTerminated?()
    }

    // Each step of a load is logged in a debug build (Capacitor's log, as its own "WebView loaded" is), so a run in the
    // simulator shows what happened (scripts/dev/app/ios-simulator.sh).

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        CAPLog.print("⚡️  Flossify: committed", webView.url?.absoluteString ?? "-")
        target?.webView?(webView, didCommit: navigation)
        onCommit?(webView.url)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        CAPLog.print("⚡️  Flossify: finished", webView.url?.absoluteString ?? "-")
        target?.webView?(webView, didFinish: navigation)
        onLoadEnded?()
        onFinish?()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        let nsError = error as NSError
        CAPLog.print("⚡️  Flossify: failed", nsError.domain, nsError.code, webView.url?.absoluteString ?? "-")
        onLoadEnded?()
        if Self.onlyInterrupted(error) { return }
        onFailed?(nsError)
        target?.webView?(webView, didFail: navigation, withError: error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let nsError = error as NSError
        CAPLog.print("⚡️  Flossify: failed to start", nsError.domain, nsError.code, (nsError.userInfo[NSURLErrorFailingURLStringErrorKey] as? String) ?? "-")
        onLoadEnded?()
        if Self.onlyInterrupted(error) { return }
        guard let ask = onStartFailed else {
            target?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
            return
        }
        ask(nsError) { [weak self, weak webView] dealtWith in
            guard !dealtWith, let webView = webView else { return }
            self?.target?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        }
    }

    /// A load the person cancelled (a second tap), one turned into a download, or one a plugin took over: none of these
    /// means the line is down, so none may show the offline page.
    static func onlyInterrupted(_ error: Error) -> Bool {
        let error = error as NSError
        if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled { return true }
        // WebKitErrorFrameLoadInterruptedByPolicyChange (102) and WebKitErrorPlugInWillHandleLoad (204).
        if error.domain == "WebKitErrorDomain" && (error.code == 102 || error.code == 204) { return true }
        return false
    }

    // WKDownloadDelegate

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        do {
            let url = try FlossifyFiles.newFileURL(named: suggestedFilename)
            destinations[ObjectIdentifier(download)] = url
            completionHandler(url)
        } catch {
            // No place to put it: the download is called off, and said to have failed.
            completionHandler(nil)
            failed(download)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        ended(download)
        guard let url = destinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        // A file the page itself made (blob: or data:) may go to Photos; a file from the server may not.
        let madeByPage = ["blob", "data"].contains(download.originalRequest?.url?.scheme?.lowercased() ?? "")
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let presenter = self.presenter else {
                try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
                return
            }
            if let own = self.onDownloaded, own(url, madeByPage) { return }
            FlossifyFiles.share(url, from: presenter, madeByPage: madeByPage)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        failed(download)
    }

    /// A download that did not arrive: the page says so in its own words (app-shell.js, downloadFailed). The warning
    /// haptic, not the error one: a dead line is not a refusal. Once for each download, however it ended.
    private func failed(_ download: WKDownload) {
        let wasRunning = running.contains(ObjectIdentifier(download))
        ended(download)
        if let url = destinations.removeValue(forKey: ObjectIdentifier(download)) {
            try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
        }
        guard wasRunning else { return }
        DispatchQueue.main.async { [weak self] in
            FlossifyHaptics.shared.notify("warning")
            if let own = self?.onDownloadFailed, own() { return }
            self?.asker?.evaluateJavaScript("window.flossifyApp && window.flossifyApp.downloadFailed && window.flossifyApp.downloadFailed(), true")
        }
    }
}

// MARK: - New tabs, other websites, long presses

/// Sits in front of Capacitor's UI delegate (its alerts and confirms stay as they are).
final class UIProxy: NSObject, WKUIDelegate {
    private weak var target: WKUIDelegate?
    private weak var presenter: UIViewController?

    init(target: WKUIDelegate?, presenter: UIViewController) {
        self.target = target
        self.presenter = presenter
        super.init()
    }

    override func responds(to aSelector: Selector!) -> Bool {
        if super.responds(to: aSelector) { return true }
        return target?.responds(to: aSelector) ?? false
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let target = target, target.responds(to: aSelector) { return target }
        return super.forwardingTarget(for: aSelector)
    }

    /// A page Flossify opens in a new tab opens in a sheet with the same sign-in; another website in a Safari view.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url, let presenter = presenter else { return nil }
        let host = url.host?.lowercased() ?? ""
        if (url.scheme == "https" || url.scheme == "http") && flossifyHosts.contains(host) {
            PageSheetController.open(url, over: presenter, like: webView)
        } else if url.scheme == "https" || url.scheme == "http" {
            presenter.present(SFSafariViewController(url: url), animated: true)
        } else {
            UIApplication.shared.open(url)
        }
        return nil
    }

    /// No long-press menu on pictures (Save to Photos would put a patient's X-ray in the camera roll, unrecorded) and no
    /// link previews (a preview loads the page, and a file's preview would be logged as a view). Text keeps its own menu.
    func webView(_ webView: WKWebView, contextMenuConfigurationForElement elementInfo: WKContextMenuElementInfo,
                 completionHandler: @escaping (UIContextMenuConfiguration?) -> Void) {
        completionHandler(nil)
    }
}

// MARK: - A page in a sheet

/// A Flossify page shown over the page that opened it: a prescription or letter to print, the X-ray viewer, the privacy
/// notice. It shares the app's sign-in (the same website data store), has its own small bridge for haptics, printing and
/// saving, and closes with Done or a swipe down. A link inside it to another page ("Back to Ana's record") closes it and
/// opens there in the page underneath, so the same record is never open twice.
final class PageSheetController: UIViewController, WKScriptMessageHandlerWithReply, WKUIDelegate,
                                 UIAdaptivePresentationControllerDelegate {
    private var webView: WKWebView!
    private var content: WKUserContentController?
    private var navigation: NavigationProxy?
    private var ui: UIProxy?
    private var titleWatch: NSKeyValueObservation?
    private let loadBar = LoadBar()
    /// The sheet has shown a page (a sheet whose first answer is a file to download never does).
    private var committed = false
    /// When iOS last ended this sheet's web view, to tell one bad moment from a page that cannot stay up.
    private var processEndedAt: Date?
    private let url: URL
    private let userAgentName: String?
    private let dataStore: WKWebsiteDataStore
    private weak var parentWebView: WKWebView?

    static func open(_ url: URL, over presenter: UIViewController, like parent: WKWebView) {
        let sheet = PageSheetController(url: url, parent: parent)
        let nav = UINavigationController(rootViewController: sheet)
        nav.modalPresentationStyle = .pageSheet
        nav.presentationController?.delegate = sheet
        if let sheetPresentation = nav.sheetPresentationController {
            sheetPresentation.prefersGrabberVisible = true
            sheetPresentation.preferredCornerRadius = 16
        }
        FlossifyHaptics.shared.impact("soft")
        presenter.present(nav, animated: true)
    }

    private init(url: URL, parent: WKWebView) {
        self.url = url
        self.userAgentName = parent.configuration.applicationNameForUserAgent
        self.dataStore = parent.configuration.websiteDataStore
        self.parentWebView = parent
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor { $0.userInterfaceStyle == .dark ? FlossifyViewController.darkPage : FlossifyViewController.lightPage }
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(close))

        let config = WKWebViewConfiguration()
        config.websiteDataStore = dataStore
        config.applicationNameForUserAgent = userAgentName
        config.allowsInlineMediaPlayback = true
        config.limitsNavigationsToAppBoundDomains = true
        let content = WKUserContentController()
        // The same call the main page makes (window.Capacitor.nativePromise), answered by this sheet.
        let bridge = """
        window.Capacitor = window.Capacitor || {
          isNativePlatform: function () { return true; },
          nativePromise: function (plugin, method, options) {
            return window.webkit.messageHandlers.flossifySheet.postMessage({ plugin: plugin, method: method, options: options || {} });
          }
        };
        """
        content.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.addScriptMessageHandler(self, contentWorld: .page, name: "flossifySheet")
        config.userContentController = content
        self.content = content

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.allowsLinkPreview = false
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        let navigation = NavigationProxy(target: nil, presenter: self)
        navigation.onLeave = { [weak self] url in self?.leave(to: url) ?? false }
        navigation.onCommit = { [weak self] _ in self?.committed = true }
        navigation.onStartFailed = { [weak self] error, answer in
            self?.startFailed(error)
            answer(true)
        }
        navigation.onFailed = { [weak self] error in
            guard let self = self else { return }
            self.showProblem(Self.words(for: error), offline: Self.isOffline(error), again: self.webView.url ?? self.url)
        }
        navigation.onDownloads = { [weak self] running in self?.loadBar.setBusy(running > 0) }
        navigation.onDownloaded = { [weak self] file, madeByPage in self?.shareFromUnderneath(file, madeByPage: madeByPage) ?? false }
        navigation.onDownloadFailed = { [weak self] in
            // With a page in the sheet, the page says it (downloadFailed). With none, the sheet would stay empty.
            guard let self = self, !self.committed else { return false }
            self.showProblem("The file could not be downloaded.", offline: false, again: self.url)
            return true
        }
        navigation.onTerminated = { [weak self] in self?.processEnded() }
        self.navigation = navigation
        webView.navigationDelegate = navigation
        let ui = UIProxy(target: self, presenter: self)
        self.ui = ui
        webView.uiDelegate = ui
        view.addSubview(webView)
        // The same line as the main page's, under the sheet's bar: a sheet on a slow line is otherwise an empty sheet.
        loadBar.watch(webView)
        view.addSubview(loadBar)
        titleWatch = webView.observe(\.title, options: [.new]) { [weak self] web, _ in
            self?.title = web.title?.replacingOccurrences(of: " — Flossify", with: "")
        }
        webView.load(URLRequest(url: url))
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        loadBar.frame = CGRect(x: 0, y: view.safeAreaInsets.top, width: view.bounds.width, height: LoadBar.height)
    }

    // MARK: When the page does not arrive

    private static func isOffline(_ error: NSError) -> Bool {
        error.domain == NSURLErrorDomain && error.code == NSURLErrorNotConnectedToInternet
    }

    /// The offline page's own heading when the phone has no line; plainer words for anything else, which is not "offline".
    private static func words(for error: NSError) -> String {
        if isOffline(error) { return "You're offline." }
        return error.domain == NSURLErrorDomain ? "Flossify is not answering." : "This page could not be opened."
    }

    /// A load that could not start. With a page already in the sheet, WebKit has left it there alive, so it stays: it
    /// is told (app-shell.js, lineFailed) and the line's failure is felt. With none, the sheet says what happened.
    private func startFailed(_ error: NSError) {
        guard committed, contentUnavailableConfiguration == nil else {
            showProblem(Self.words(for: error), offline: Self.isOffline(error), again: url)
            return
        }
        let neverSent = error.domain == NSURLErrorDomain && [NSURLErrorNotConnectedToInternet, NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed].contains(error.code)
        // One failure, one warning: the page's lineFailed plays it itself (through this sheet's bridge), so the app
        // plays it only for a page that could not be told.
        let tell = "(window.flossifyApp && typeof window.flossifyApp.lineFailed === 'function') ? (window.flossifyApp.lineFailed(\(neverSent ? "false" : "'maybe'")), true) : false"
        webView.evaluateJavaScript(tell) { result, _ in
            if (result as? Bool) != true { FlossifyHaptics.shared.notify("warning") }
        }
    }

    /// In place of an empty sheet: what happened, in the soft template's words and colours, and one way on.
    private func showProblem(_ words: String, offline: Bool, again: URL) {
        var problem = UIContentUnavailableConfiguration.empty()
        problem.image = UIImage(systemName: offline ? "wifi.slash" : "exclamationmark.triangle")
        problem.imageProperties.tintColor = FlossifyViewController.ink2
        problem.text = words
        problem.textProperties.color = FlossifyViewController.ink
        var button = UIButton.Configuration.filled()
        button.title = "Try again"
        button.baseBackgroundColor = FlossifyViewController.teal
        button.baseForegroundColor = .white
        button.cornerStyle = .medium
        // 17 pt words in a button 48 pt tall: a full touch target.
        button.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 28, bottom: 14, trailing: 28)
        problem.button = button
        problem.buttonProperties.primaryAction = UIAction { [weak self] _ in
            guard let self = self else { return }
            FlossifyHaptics.shared.impact("medium")
            self.contentUnavailableConfiguration = nil
            self.webView.isHidden = false
            self.webView.load(URLRequest(url: again))
        }
        webView.isHidden = true
        contentUnavailableConfiguration = problem
        FlossifyHaptics.shared.notify("warning")
        if UIAccessibility.isVoiceOverRunning { UIAccessibility.post(notification: .screenChanged, argument: nil) }
    }

    /// iOS ended the sheet's web view (memory): the page is loaded again, once; if it ends again straight away, the
    /// sheet says so instead of going round.
    private func processEnded() {
        if let last = processEndedAt, Date().timeIntervalSince(last) < 10 {
            showProblem("This page could not be opened.", offline: false, again: webView.url ?? url)
            return
        }
        processEndedAt = Date()
        if webView.url == nil { webView.load(URLRequest(url: url)) } else { webView.reload() }
    }

    /// A link that opened this sheet and turned out to be a file (an export, a patient's file sent as an attachment):
    /// the sheet never had a page to show, so it closes and the file is offered over the page underneath.
    private func shareFromUnderneath(_ file: URL, madeByPage: Bool) -> Bool {
        guard !committed, let underneath = presentingViewController else { return false }
        dismiss(animated: true) { FlossifyFiles.share(file, from: underneath, madeByPage: madeByPage) }
        return true
    }

    /// VoiceOver's two-finger scrub: back inside the sheet, then out of it (Done's own rule: typed words are asked about).
    override func accessibilityPerformEscape() -> Bool {
        if webView.canGoBack { webView.goBack() } else { close() }
        return true
    }

    @objc private func close() {
        // Done on a page holding typed words asks first, as a swipe down does.
        if navigationController?.isModalInPresentation == true, let presentation = navigationController?.presentationController {
            presentationControllerDidAttemptToDismiss(presentation)
            return
        }
        dismiss(animated: true)
    }

    /// A link to another of our pages ("Back to Ana's record"): the sheet closes, and the page underneath goes there. Not
    /// a download, not tel: or mailto:, not the same page with another query (a language), and never when the page
    /// underneath is one a patient holds or a signing page. When the page underneath already is that page, it stays as
    /// it is (its visit, its typed words), only scrolled to the part named; when it holds typed words, the link opens
    /// here in the sheet instead.
    private func leave(to target: URL) -> Bool {
        guard let parent = parentWebView, let here = webView.url,
              let scheme = target.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = target.host?.lowercased(), flossifyHosts.contains(host),
              URLComponents(url: target, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: { $0.name == "download" }) != true,
              target.path != here.path else { return false }
        var underneath = parent.url?.path ?? "/"
        if !underneath.hasSuffix("/") && !underneath.contains(".") { underneath += "/" }
        if FlossifyViewController.guarded(underneath) { return false }
        if parent.url?.host?.lowercased() == host, parent.url?.path == target.path {
            dismiss(animated: true) {
                if let part = target.fragment, let data = try? JSONSerialization.data(withJSONObject: [part]),
                   let json = String(data: data, encoding: .utf8) {
                    parent.evaluateJavaScript("location.hash = \(json)[0]")
                }
            }
            return true
        }
        let ask = "(window.flossifyApp && window.flossifyApp.canRefresh) ? window.flossifyApp.canRefresh() : true"
        parent.evaluateJavaScript(ask) { [weak self] result, _ in
            guard let self = self else { return }
            if let free = result as? Bool, free == false {
                // (A load the app makes is not a tapped link, so it does not come back here.)
                self.webView.load(URLRequest(url: target))
            } else {
                self.dismiss(animated: true) { parent.load(URLRequest(url: target)) }
            }
        }
        return true
    }

    // A swipe down on a sheet whose page holds typed words (setChrome's `typed`): asked first.

    func presentationControllerDidAttemptToDismiss(_ presentationController: UIPresentationController) {
        let ask = UIAlertController(title: nil, message: "What you typed here is not saved yet.", preferredStyle: .actionSheet)
        ask.addAction(UIAlertAction(title: "Keep editing", style: .cancel))
        ask.addAction(UIAlertAction(title: "Close without saving", style: .destructive) { [weak self] _ in self?.dismiss(animated: true) })
        if let popover = ask.popoverPresentationController {
            popover.barButtonItem = navigationItem.rightBarButtonItem
        }
        show(ask) {}
    }

    /// An alert over whatever is on top of the sheet; with nothing on screen to show it, the page is answered at once
    /// (WebKit requires every alert to be answered).
    private func show(_ alert: UIAlertController, orElse answer: () -> Void) {
        guard let top = FlossifyFiles.topmost(from: self) else { answer(); return }
        top.present(alert, animated: true)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // The content controller holds this sheet strongly: let go once the sheet is gone.
        if isBeingDismissed || navigationController?.isBeingDismissed == true {
            content?.removeScriptMessageHandler(forName: "flossifySheet", contentWorld: .page)
            titleWatch = nil
            loadBar.stopWatching()
        }
    }

    // WKUIDelegate, through UIProxy: a window.close() (no page calls it today), and the page's alerts.

    func webViewDidClose(_ webView: WKWebView) {
        close()
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        show(alert) { completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        show(alert) { completionHandler(false) }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let plugin = body["plugin"] as? String,
              let method = body["method"] as? String else {
            replyHandler(nil, "Bad call")
            return
        }
        let options = body["options"] as? [String: Any] ?? [:]
        switch plugin {
        case "FlossifyShell":
            if method == "setChrome" {
                // Only one thing matters in a sheet: typed words make a swipe down ask first.
                navigationController?.isModalInPresentation = (options["typed"] as? Bool) ?? false
                replyHandler([String: Any](), nil)
                return
            }
            FlossifyCalls.perform(method, options, webView: webView, from: self) { answer, problem in replyHandler(answer, problem) }
        case "Browser":
            if let link = options["url"] as? String, let url = URL(string: link), url.scheme == "https" || url.scheme == "http",
               let top = FlossifyFiles.topmost(from: self) {
                top.present(SFSafariViewController(url: url), animated: true)
            }
            replyHandler([String: Any](), nil)
        default:
            // SplashScreen and the rest have nothing to do in a sheet.
            replyHandler([String: Any](), nil)
        }
    }
}

extension UIColor {
    /// "#rrggbb", as src/components/app-shell.js sends the page's ground colour.
    convenience init?(flossifyHex hex: String) {
        let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return nil }
        self.init(red: CGFloat((value >> 16) & 0xff) / 255, green: CGFloat((value >> 8) & 0xff) / 255,
                  blue: CGFloat(value & 0xff) / 255, alpha: 1)
    }
}
