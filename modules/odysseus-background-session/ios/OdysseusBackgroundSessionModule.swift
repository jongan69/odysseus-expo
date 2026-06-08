import ExpoModulesCore
import UIKit

public class OdysseusBackgroundSessionModule: Module {
  private var activeTasks: [String: UIBackgroundTaskIdentifier] = [:]

  public func definition() -> ModuleDefinition {
    Name("OdysseusBackgroundSession")

    AsyncFunction("beginAsync") { (reason: String) -> String? in
      let identifier = UUID().uuidString
      var taskIdentifier = UIBackgroundTaskIdentifier.invalid

      taskIdentifier = UIApplication.shared.beginBackgroundTask(withName: reason) { [weak self] in
        self?.endTask(identifier)
      }

      if taskIdentifier == .invalid {
        return nil
      }

      self.activeTasks[identifier] = taskIdentifier
      return identifier
    }.runOnQueue(.main)

    AsyncFunction("endAsync") { (identifier: String) in
      self.endTask(identifier)
    }.runOnQueue(.main)

    AsyncFunction("endAllAsync") {
      self.endAllTasks()
    }.runOnQueue(.main)

    AsyncFunction("getRemainingTimeAsync") { () -> Double in
      let remainingTime = UIApplication.shared.backgroundTimeRemaining
      if remainingTime == Double.greatestFiniteMagnitude {
        return -1
      }
      return remainingTime
    }.runOnQueue(.main)

    AsyncFunction("getActiveTaskCountAsync") { () -> Int in
      return self.activeTasks.count
    }.runOnQueue(.main)

    OnDestroy {
      self.endAllTasks()
    }
  }

  private func endTask(_ identifier: String) {
    guard let taskIdentifier = activeTasks.removeValue(forKey: identifier) else {
      return
    }
    UIApplication.shared.endBackgroundTask(taskIdentifier)
  }

  private func endAllTasks() {
    let taskIdentifiers = activeTasks.values
    activeTasks.removeAll()
    for taskIdentifier in taskIdentifiers {
      UIApplication.shared.endBackgroundTask(taskIdentifier)
    }
  }
}
