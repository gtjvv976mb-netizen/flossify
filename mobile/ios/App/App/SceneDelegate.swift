import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // Flossify's own controller: haptics, printing, downloads, swipe back, pull to refresh (FlossifyShell.swift).
        let controller = FlossifyViewController()
        // Started from a Home Screen quick action: its page opens in place of the start page.
        controller.startPath = connectionOptions.shortcutItem.flatMap(Self.path(for:))
        window?.rootViewController = controller
        // Done, alert buttons and the in-app browser's controls in Flossify's teal, not the system's blue (the pale teal
        // in the dark, where the deep one is too faint to read).
        window?.tintColor = FlossifyViewController.tint
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // MARK: Home Screen quick actions

    /// The three quick actions (Info.plist, UIApplicationShortcutItems) and the page each opens: the same three doors
    /// the app's start page offers, one press from the Home Screen.
    static func path(for item: UIApplicationShortcutItem) -> String? {
        switch item.type.split(separator: ".").last {
        case "find": return "/find/"
        case "visits": return "/me/"
        case "signin": return "/auth/login/"
        default: return nil
        }
    }

    /// A quick action with the app already running. The controller decides whether it may go (never away from a page a
    /// patient holds or one holding typed words: FlossifyViewController.open).
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem,
                     completionHandler: @escaping (Bool) -> Void) {
        guard let path = Self.path(for: shortcutItem), let controller = window?.rootViewController as? FlossifyViewController else {
            completionHandler(false)
            return
        }
        controller.open(path: path, completion: completionHandler)
    }
}
