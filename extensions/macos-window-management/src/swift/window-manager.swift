import AppKit
import ApplicationServices

enum Action: String {
    case rotate = "rotate"
    case left = "left"
    case right = "right"
    case fullscreen = "fullscreen"
}

// accessibility
let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
guard AXIsProcessTrustedWithOptions(options) else {
    print("Error: Missing Accessibility permissions. Please allow this terminal or binary in System Settings.")
    exit(1)
}

// actions
let actionArg = CommandLine.arguments.count > 1 ? CommandLine.arguments[1].lowercased() : "rotate"
let action = Action(rawValue: actionArg) ?? .rotate

// get front window
guard let frontmostApp = NSWorkspace.shared.frontmostApplication else { exit(0) }
let appElement = AXUIElementCreateApplication(frontmostApp.processIdentifier)
var focusedWindow: AnyObject?

guard AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute as CFString, &focusedWindow) == .success,
      let window = focusedWindow as! AXUIElement? else { exit(0) }

// get dimensions
var posValue: AnyObject?
var sizeValue: AnyObject?
AXUIElementCopyAttributeValue(window, kAXPositionAttribute as CFString, &posValue)
AXUIElementCopyAttributeValue(window, kAXSizeAttribute as CFString, &sizeValue)

var position = CGPoint.zero
var size = CGSize.zero
AXValueGetValue(posValue as! AXValue, .cgPoint, &position)
AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)

let screens = NSScreen.screens
guard !screens.isEmpty else { exit(0) }

// get main window center to display
let winCenter = CGPoint(x: position.x + (size.width / 2), y: position.y + (size.height / 2))
var currentScreen = screens.first!
var currentIdx = 0

// top left coordinate extraction
for (idx, screen) in screens.enumerated() {
    let sFrame = screen.frame
    // NSScreen coordinates originate from bottom-left; translate to top-left space mapping
    let mainScreenHeight = screens.first!.frame.height
    let topLeftY = mainScreenHeight - sFrame.origin.y - sFrame.size.height
    let nativeRect = CGRect(x: sFrame.origin.x, y: topLeftY, width: sFrame.size.width, height: sFrame.size.height)

    if nativeRect.contains(winCenter) {
        currentScreen = screen
        currentIdx = idx
        break
    }
}

// get visible frames without dock and menu bar
let vFrame = currentScreen.visibleFrame
let mainHeight = screens.first!.frame.height
let curTopLeftY = mainHeight - vFrame.origin.y - vFrame.size.height

var newPos = position
var newSize = size

// handle workspaces
switch action {
case .rotate:
    if screens.count > 1 {
        let nextScreen = screens[(currentIdx + 1) % screens.count]
        let nextVFrame = nextScreen.visibleFrame
        let nextTopLeftY = mainHeight - nextVFrame.origin.y - nextVFrame.size.height

        let relX = position.x - vFrame.origin.x
        let relY = position.y - curTopLeftY

        newPos = CGPoint(x: nextVFrame.origin.x + relX, y: nextTopLeftY + relY)
    }
case .left:
    newSize = CGSize(width: vFrame.size.width / 2, height: vFrame.size.height)
    newPos = CGPoint(x: vFrame.origin.x, y: curTopLeftY)
case .right:
    newSize = CGSize(width: vFrame.size.width / 2, height: vFrame.size.height)
    newPos = CGPoint(x: vFrame.origin.x + (vFrame.size.width / 2), y: curTopLeftY)
case .fullscreen:
    newSize = CGSize(width: vFrame.size.width, height: vFrame.size.height)
    newPos = CGPoint(x: vFrame.origin.x, y: curTopLeftY)
}

// do the move
var finalPos = newPos
var finalSize = newSize
let posVal = AXValueCreate(.cgPoint, &finalPos)!
let sizeVal = AXValueCreate(.cgSize, &finalSize)!

AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, posVal)
AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, sizeVal)
