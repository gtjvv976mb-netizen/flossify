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

let flossifyHosts: Set<String> = ["flossify.ph", "www.flossify.ph"]

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

// MARK: - The view controller

final class FlossifyViewController: CAPBridgeViewController {
    private let refresh = UIRefreshControl()
    private var navigationProxy: NavigationProxy?
    private var uiProxy: UIProxy?
    private var refreshTimeout: DispatchWorkItem?
    private var observers: [NSObjectProtocol] = []
    private var cover: UIView?
    /// The address of the page on screen, from the last navigation the web view committed.
    private(set) var currentPath = "/"
    /// What the page says (src/components/app-shell.js, setChrome): false while something is drawn over it (a panel, the drawer,
    /// a consent turned to the patient), where a sideways drag belongs to that.
    var pageAllowsSwipe = true
    var pageIsDark = false
    /// The launch screen, kept over the web view until the page has drawn itself (showLaunchCover).
    private var launchCover: UIView?
    private var revealed = false

    /// The soft template's page colours (#f3f5f8 light, #15191e dark): behind the page while it loads and when it bounces.
    static let lightPage = UIColor(red: 0xf3 / 255, green: 0xf5 / 255, blue: 0xf8 / 255, alpha: 1)
    static let darkPage = UIColor(red: 0x15 / 255, green: 0x19 / 255, blue: 0x1e / 255, alpha: 1)
    static let teal = UIColor(red: 0x0e / 255, green: 0x74 / 255, blue: 0x71 / 255, alpha: 1)

    override func capacitorDidLoad() {
        FlossifyFiles.clearAll()
        Self.keepOutOfBackups()
        let plugin = FlossifyShellPlugin()
        plugin.owner = self
        bridge?.registerPluginInstance(plugin)

        guard let webView = webView else { return }
        setPageColor(UIColor { $0.userInterfaceStyle == .dark ? Self.darkPage : Self.lightPage })
        showLaunchCover()

        // iOS's own feel: the edge swipe goes back and forward, the page bounces, the keyboard follows the finger.
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.bounces = true
        webView.scrollView.alwaysBounceVertical = true
        webView.scrollView.keyboardDismissMode = .interactive
        webView.allowsLinkPreview = false

        refresh.tintColor = Self.teal
        refresh.addTarget(self, action: #selector(pulled), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        let navigation = NavigationProxy(target: webView.navigationDelegate, presenter: self)
        navigation.onLoadEnded = { [weak self] in self?.endRefreshing() }
        navigation.onCommit = { [weak self] url in self?.arrived(at: url) }
        // A page without the app's script (the app's own offline page) never says it is ready: its load ending does.
        navigation.onFinish = { [weak self] in self?.reveal(after: 0.6) }
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
        observers.append(centre.addObserver(forName: UIScene.didActivateNotification, object: nil, queue: .main) { [weak self] _ in
            self?.uncover()
        })
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
    }

    // MARK: The launch screen

    /// The launch screen (Assets: Splash, as LaunchScreen.storyboard shows it) stays over the web view until the page
    /// has drawn itself: the page says so (FlossifyShell.ready, from the app's script), or, for a page without that script
    /// (the offline page), its load has finished. Never on a timer before that: measured in the simulator, a web view
    /// uncovered while its first page was still on its way (Capacitor's splash screen, whose own timer ran out after 4 s
    /// on a slow line) stayed blank. After 30 s it is shown whatever happened, so the app is never stuck behind it.
    private func showLaunchCover() {
        let cover = UIImageView(image: UIImage(named: "Splash"))
        cover.contentMode = .scaleAspectFill
        cover.backgroundColor = UIColor { $0.userInterfaceStyle == .dark ? Self.darkPage : Self.lightPage }
        cover.frame = view.bounds
        cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        cover.isUserInteractionEnabled = true // nothing under it is tapped before it is seen
        view.addSubview(cover)
        launchCover = cover
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in self?.reveal() }
    }

    /// Fades the launch screen out, once.
    func reveal(after delay: TimeInterval = 0) {
        guard !revealed else { return }
        if delay > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.reveal() }
            return
        }
        revealed = true
        guard let cover = launchCover else { return }
        launchCover = nil
        UIView.animate(withDuration: 0.3, delay: 0, options: [.curveEaseOut], animations: { cover.alpha = 0 }) { _ in
            cover.removeFromSuperview()
        }
    }

    // MARK: Where the page is

    /// A page where the edge swipe must never go back: a sign-in page (the page behind may be the last person's), a page
    /// a patient holds (the desk's device handed over, a clinic tablet, signing on the tablet), the patients' door.
    static func guarded(_ path: String) -> Bool {
        path.hasPrefix("/auth/") || path.hasPrefix("/f/") || path.contains("/sign/") || path.hasSuffix("/sign-in/")
            || path == "/me/" || path.hasPrefix("/me/code")
    }

    /// A page the screen stays awake on: a clinic tablet waiting for the next patient, a device handed to a patient.
    static func keepsAwake(_ path: String) -> Bool {
        path.hasPrefix("/f/t/") || path.hasPrefix("/f/i/")
    }

    /// A page the app switcher must not keep a picture of.
    static func isPrivate(_ path: String) -> Bool {
        ["/c/", "/f/", "/me/", "/admin/"].contains { path.hasPrefix($0) }
    }

    func arrived(at url: URL?) {
        // URL.path drops the closing slash the site's addresses carry; put it back so "/me/" reads as "/me/".
        var path = url?.path ?? ""
        if path.isEmpty { path = "/" }
        if !path.hasSuffix("/") && !path.contains(".") { path += "/" }
        currentPath = path
        pageAllowsSwipe = true
        applySwipe()
        UIApplication.shared.isIdleTimerDisabled = Self.keepsAwake(currentPath)
    }

    func applySwipe() {
        webView?.allowsBackForwardNavigationGestures = pageAllowsSwipe && !Self.guarded(currentPath)
    }

    private func coverIfPrivate() {
        guard cover == nil, Self.isPrivate(currentPath), let window = view.window else { return }
        let shield = UIView(frame: window.bounds)
        shield.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        shield.backgroundColor = pageIsDark ? Self.darkPage : Self.lightPage
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

    /// Pull to refresh: the page says first whether it may reload (it may not while a form holds typed words).
    @objc private func pulled() {
        FlossifyHaptics.shared.impact("medium")
        // On the app's own offline page (capacitor://…/offline.html) a reload would load it again: try the site.
        if let here = webView?.url, here.scheme != "https" && here.scheme != "http", let start = bridge?.config.appStartServerURL {
            webView?.load(URLRequest(url: start))
            armRefreshTimeout()
            return
        }
        let ask = "(window.flossifyApp && window.flossifyApp.canRefresh) ? window.flossifyApp.canRefresh() : true"
        webView?.evaluateJavaScript(ask) { [weak self] result, _ in
            guard let self = self else { return }
            if let allowed = result as? Bool, allowed == false {
                self.refresh.endRefreshing()
                FlossifyHaptics.shared.notify("warning")
                self.webView?.evaluateJavaScript("window.flossifyApp && window.flossifyApp.refreshRefused && window.flossifyApp.refreshRefused()")
                return
            }
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

    /// The page has drawn itself (public: src/components/app-shell.js, at DOMContentLoaded): the launch screen goes.
    @objc func ready(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in self?.owner?.reveal(after: 0.05) }
        call.resolve()
    }

    /// The page's theme (the person's own choice, or the device's): the status bar's words and the colour behind the page.
    /// Whether a sideways drag may go back (not while something is drawn over the page), and the page's own ground colour.
    @objc func setChrome(_ call: CAPPluginCall) {
        let dark = call.getBool("dark") ?? false
        let ground = call.getString("color").flatMap(UIColor.init(flossifyHex:))
        let swipe = call.getBool("swipeBack")
        let chosen = call.getString("theme") ?? ""
        DispatchQueue.main.async { [weak self] in
            guard let owner = self?.owner else { return }
            owner.pageIsDark = dark
            // Alerts, pickers and sheets in the person's own choice of light or dark; following the device when they
            // chose nothing (an override then would also stop the page hearing the device change).
            owner.view.window?.overrideUserInterfaceStyle = chosen == "dark" ? .dark : chosen == "light" ? .light : .unspecified
            owner.setStatusBarStyle(dark ? .lightContent : .darkContent)
            owner.setPageColor(ground ?? (dark ? FlossifyViewController.darkPage : FlossifyViewController.lightPage))
            if let swipe = swipe {
                owner.pageAllowsSwipe = swipe
                owner.applySwipe()
            }
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
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
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
        target?.webView?(webView, didFail: navigation, withError: error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let nsError = error as NSError
        CAPLog.print("⚡️  Flossify: failed to start", nsError.domain, nsError.code, (nsError.userInfo[NSURLErrorFailingURLStringErrorKey] as? String) ?? "-")
        onLoadEnded?()
        if Self.onlyInterrupted(error) { return }
        target?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
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
            completionHandler(nil)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = destinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        // A file the page itself made (blob: or data:) may go to Photos; a file from the server may not.
        let madeByPage = ["blob", "data"].contains(download.originalRequest?.url?.scheme?.lowercased() ?? "")
        DispatchQueue.main.async { [weak self] in
            guard let presenter = self?.presenter else {
                try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
                return
            }
            FlossifyFiles.share(url, from: presenter, madeByPage: madeByPage)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let url = destinations.removeValue(forKey: ObjectIdentifier(download)) {
            try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
        }
        DispatchQueue.main.async { FlossifyHaptics.shared.notify("error") }
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
        self.navigation = navigation
        webView.navigationDelegate = navigation
        let ui = UIProxy(target: self, presenter: self)
        self.ui = ui
        webView.uiDelegate = ui
        view.addSubview(webView)
        titleWatch = webView.observe(\.title, options: [.new]) { [weak self] web, _ in
            self?.title = web.title?.replacingOccurrences(of: " — Flossify", with: "")
        }
        webView.load(URLRequest(url: url))
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
