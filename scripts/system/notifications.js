"use strict";

//
//  notifications.js
//  Version 0.801
//  Created by Adrian
//
//  Adrian McCarlie 8-10-14
//  This script demonstrates on-screen overlay type notifications.
//  Copyright 2014 High Fidelity, Inc.
//
//
//  Distributed under the Apache License, Version 2.0.
//  See the accompanying file LICENSE or http://www.apache.org/licenses/LICENSE-2.0.html

//  This script generates notifications created via a number of ways, such as:
//  keystroke:
//
//  CTRL/s for snapshot.

//  System generated notifications:
//  Connection refused.
//
//  To add a new System notification type:
//
//  1. Set the Event Connector at the bottom of the script.
//  example:
//  AudioDevice.muteToggled.connect(onMuteStateChanged);
//
//  2. Create a new function to produce a text string, do not include new line returns.
//  example:
//  function onMuteStateChanged() {
//     var muteState,
//         muteString;
//
//     muteState = AudioDevice.getMuted() ? "muted" : "unmuted";
//     muteString = "Microphone is now " + muteState;
//     createNotification(muteString, NotificationType.MUTE_TOGGLE);
//  }
//
//  This new function must call wordWrap(text) if the length of message is longer than 42 chars or unknown.
//  wordWrap() will format the text to fit the notifications overlay and return it
//  after that we will send it to createNotification(text).
//  If the message is 42 chars or less you should bypass wordWrap() and call createNotification() directly.

//  To add a keypress driven notification:
//
//  1. Add a key to the keyPressEvent(key).
//  2. Declare a text string.
//  3. Call createNotifications(text, NotificationType) parsing the text.
//  example:
//  if (key.text === "o") {
//      if (ctrlIsPressed === true) {
//          noteString = "Open script";
//          createNotification(noteString, NotificationType.OPEN_SCRIPT);
//      }
//  }

/* global Script, Controller, Overlays, SoundArray, Quat, Vec3, MyAvatar, Menu, HMD, AudioDevice, LODManager, Settings, Camera */

(function() { // BEGIN LOCAL_SCOPE

Script.include("./libraries/soundArray.js");

var width = 340.0; //width of notification overlay
var windowDimensions = Controller.getViewportDimensions(); // get the size of the interface window
var overlayLocationX = (windowDimensions.x - (width + 20.0)); // positions window 20px from the right of the interface window
var buttonLocationX = overlayLocationX + (width - 28.0);
var locationY = 20.0; // position down from top of interface window
var topMargin = 13.0;
var leftMargin = 10.0;
var textColor =  { red: 228, green: 228, blue: 228}; // text color
var backColor =  { red: 2, green: 2, blue: 2}; // background color was 38,38,38
var backgroundAlpha = 0;
var fontSize = 12.0;
var PERSIST_TIME_2D = 10.0;  // Time in seconds before notification fades
var PERSIST_TIME_3D = 15.0;
var persistTime = PERSIST_TIME_2D;
var frame = 0;
var ourWidth = Window.innerWidth;
var ourHeight = Window.innerHeight;
var ctrlIsPressed = false;
var ready = true;
var MENU_NAME = 'Tools > Notifications';
var PLAY_NOTIFICATION_SOUNDS_MENU_ITEM = "Play Notification Sounds";
var NOTIFICATION_MENU_ITEM_POST = " Notifications";
var PLAY_NOTIFICATION_SOUNDS_SETTING = "play_notification_sounds";
var PLAY_NOTIFICATION_SOUNDS_TYPE_SETTING_PRE = "play_notification_sounds_type_";
var lodTextID = false;

var NotificationType = {
    UNKNOWN: 0,
    SNAPSHOT: 1,
    LOD_WARNING: 2,
    CONNECTION_REFUSED: 3,
    EDIT_ERROR: 4,
    TABLET: 5,
    CONNECTION: 6,
    properties: [
        { text: "Snapshot" },
        { text: "Level of Detail" },
        { text: "Connection Refused" },
        { text: "Edit error" },
        { text: "Tablet" },
        { text: "Connection" }
    ],
    getTypeFromMenuItem: function(menuItemName) {
        if (menuItemName.substr(menuItemName.length - NOTIFICATION_MENU_ITEM_POST.length) !== NOTIFICATION_MENU_ITEM_POST) {
            return NotificationType.UNKNOWN;
        }
        var preMenuItemName = menuItemName.substr(0, menuItemName.length - NOTIFICATION_MENU_ITEM_POST.length);
        for (var type in this.properties) {
            if (this.properties[type].text === preMenuItemName) {
                return parseInt(type) + 1;
            }
        }
        return NotificationType.UNKNOWN;
    },
    getMenuString: function(type) {
        return this.properties[type - 1].text + NOTIFICATION_MENU_ITEM_POST;
    }
};

var randomSounds = new SoundArray({ localOnly: true }, true);
var numberOfSounds = 2;
for (var i = 1; i <= numberOfSounds; i++) {
    randomSounds.addSound(Script.resolvePath("assets/sounds/notification-general"+ i + ".raw"));
}

var notifications = [];
var buttons = [];
var times = [];
var heights = [];
var myAlpha = [];
var arrays = [];
var isOnHMD = false,
    NOTIFICATIONS_3D_DIRECTION = 0.0,  // Degrees from avatar orientation.
    NOTIFICATIONS_3D_DISTANCE = 0.6,  // Horizontal distance from avatar position.
    NOTIFICATIONS_3D_ELEVATION = -0.8,  // Height of top middle of top notification relative to avatar eyes.
    NOTIFICATIONS_3D_YAW = 0.0,  // Degrees relative to notifications direction.
    NOTIFICATIONS_3D_PITCH = -60.0,  // Degrees from vertical.
    NOTIFICATION_3D_SCALE = 0.002,  // Multiplier that converts 2D overlay dimensions to 3D overlay dimensions.
    NOTIFICATION_3D_BUTTON_WIDTH = 40 * NOTIFICATION_3D_SCALE,  // Need a little more room for button in 3D.
    overlay3DDetails = [];

//  push data from above to the 2 dimensional array
function createArrays(notice, button, createTime, height, myAlpha) {
    arrays.push([notice, button, createTime, height, myAlpha]);
}

//  This handles the final dismissal of a notification after fading
function dismiss(firstNoteOut, firstButOut, firstOut) {
    if (firstNoteOut == lodTextID) {
        lodTextID = false;
    }

    Overlays.deleteOverlay(firstNoteOut);
    Overlays.deleteOverlay(firstButOut);
    notifications.splice(firstOut, 1);
    buttons.splice(firstOut, 1);
    times.splice(firstOut, 1);
    heights.splice(firstOut, 1);
    myAlpha.splice(firstOut, 1);
    overlay3DDetails.splice(firstOut, 1);
}

function fadeIn(noticeIn, buttonIn) {
    var q = 0,
        qFade,
        pauseTimer = null;

    pauseTimer = Script.setInterval(function () {
        q += 1;
        qFade = q / 10.0;
        Overlays.editOverlay(noticeIn, { alpha: qFade });
        Overlays.editOverlay(buttonIn, { alpha: qFade });
        if (q >= 9.0) {
            Script.clearInterval(pauseTimer);
        }
    }, 10);
}

//  this fades the notification ready for dismissal, and removes it from the arrays
function fadeOut(noticeOut, buttonOut, arraysOut) {
    var r = 9.0,
        rFade,
        pauseTimer = null;

    pauseTimer = Script.setInterval(function () {
        r -= 1;
        rFade = r / 10.0;
        Overlays.editOverlay(noticeOut, { alpha: rFade });
        Overlays.editOverlay(buttonOut, { alpha: rFade });
        if (r < 0) {
            dismiss(noticeOut, buttonOut, arraysOut);
            arrays.splice(arraysOut, 1);
            ready = true;
            Script.clearInterval(pauseTimer);
        }
    }, 20);
}

function calculate3DOverlayPositions(noticeWidth, noticeHeight, y) {
    // Calculates overlay positions and orientations in avatar coordinates.
    var noticeY,
        originOffset,
        notificationOrientation,
        notificationPosition,
        buttonPosition;

    // Notification plane positions
    noticeY = -y * NOTIFICATION_3D_SCALE - noticeHeight / 2;
    notificationPosition = { x: 0, y: noticeY, z: 0 };
    buttonPosition = { x: (noticeWidth - NOTIFICATION_3D_BUTTON_WIDTH) / 2, y: noticeY, z: 0.001 };

    // Rotate plane
    notificationOrientation = Quat.fromPitchYawRollDegrees(NOTIFICATIONS_3D_PITCH,
        NOTIFICATIONS_3D_DIRECTION + NOTIFICATIONS_3D_YAW, 0);
    notificationPosition = Vec3.multiplyQbyV(notificationOrientation, notificationPosition);
    buttonPosition = Vec3.multiplyQbyV(notificationOrientation, buttonPosition);

    // Translate plane
    originOffset = Vec3.multiplyQbyV(Quat.fromPitchYawRollDegrees(0, NOTIFICATIONS_3D_DIRECTION, 0),
        { x: 0, y: 0, z: -NOTIFICATIONS_3D_DISTANCE });
    originOffset.y += NOTIFICATIONS_3D_ELEVATION;
    notificationPosition = Vec3.sum(originOffset, notificationPosition);
    buttonPosition = Vec3.sum(originOffset, buttonPosition);

    return {
        notificationOrientation: notificationOrientation,
        notificationPosition: notificationPosition,
        buttonPosition: buttonPosition
    };
}

//  Pushes data to each array and sets up data for 2nd dimension array
//  to handle auxiliary data not carried by the overlay class
//  specifically notification "heights", "times" of creation, and .
function notify(notice, button, height, imageProperties, image) {
    var notificationText,
        noticeWidth,
        noticeHeight,
        positions,
        last;

    if (isOnHMD) {
        // Calculate 3D values from 2D overlay properties.

        noticeWidth = notice.width * NOTIFICATION_3D_SCALE + NOTIFICATION_3D_BUTTON_WIDTH;
        noticeHeight = notice.height * NOTIFICATION_3D_SCALE;

        notice.size = { x: noticeWidth, y: noticeHeight };

        positions = calculate3DOverlayPositions(noticeWidth, noticeHeight, notice.y);

        notice.parentID = MyAvatar.sessionUUID;
        notice.parentJointIndex = -2;

        if (!image) {
            notice.topMargin = 0.75 * notice.topMargin * NOTIFICATION_3D_SCALE;
            notice.leftMargin = 2 * notice.leftMargin * NOTIFICATION_3D_SCALE;
            notice.bottomMargin = 0;
            notice.rightMargin = 0;
            notice.lineHeight = 10.0 * (fontSize / 12.0) * NOTIFICATION_3D_SCALE;
            notice.isFacingAvatar = false;

            notificationText = Overlays.addOverlay("text3d", notice);
            notifications.push(notificationText);
        } else {
            notifications.push(Overlays.addOverlay("image3d", notice));
        }

        button.url = button.imageURL;
        button.scale = button.width * NOTIFICATION_3D_SCALE;
        button.isFacingAvatar = false;
        button.parentID = MyAvatar.sessionUUID;
        button.parentJointIndex = -2;

        buttons.push((Overlays.addOverlay("image3d", button)));
        overlay3DDetails.push({
            notificationOrientation: positions.notificationOrientation,
            notificationPosition: positions.notificationPosition,
            buttonPosition: positions.buttonPosition,
            width: noticeWidth,
            height: noticeHeight
        });


        var defaultEyePosition,
            avatarOrientation,
            notificationPosition,
            notificationOrientation,
            buttonPosition;

        if (isOnHMD && notifications.length > 0) {
            // Update 3D overlays to maintain positions relative to avatar
            defaultEyePosition = MyAvatar.getDefaultEyePosition();
            avatarOrientation = MyAvatar.orientation;

            for (i = 0; i < notifications.length; i += 1) {
                notificationPosition = Vec3.sum(defaultEyePosition,
                                                Vec3.multiplyQbyV(avatarOrientation,
                                                                  overlay3DDetails[i].notificationPosition));
                notificationOrientation = Quat.multiply(avatarOrientation,
                                                        overlay3DDetails[i].notificationOrientation);
                buttonPosition = Vec3.sum(defaultEyePosition,
                                          Vec3.multiplyQbyV(avatarOrientation,
                                                            overlay3DDetails[i].buttonPosition));
                Overlays.editOverlay(notifications[i], { position: notificationPosition,
                                                         rotation: notificationOrientation });
                Overlays.editOverlay(buttons[i], { position: buttonPosition, rotation: notificationOrientation });
            }
        }

    } else {
        if (!image) {
            notificationText = Overlays.addOverlay("text", notice);
            notifications.push((notificationText));
        } else {
            notifications.push(Overlays.addOverlay("image", notice));
        }
        buttons.push(Overlays.addOverlay("image", button));
    }

    height = height + 1.0;
    heights.push(height);
    times.push(new Date().getTime() / 1000);
    last = notifications.length - 1;
    myAlpha.push(notifications[last].alpha);
    createArrays(notifications[last], buttons[last], times[last], heights[last], myAlpha[last]);
    fadeIn(notifications[last], buttons[last]);

    if (imageProperties && !image) {
        var imageHeight = notice.width / imageProperties.aspectRatio;
        notice = {
            x: notice.x,
            y: notice.y + height,
            width: notice.width,
            height: imageHeight,
            subImage: { x: 0, y: 0 },
            color: { red: 255, green: 255, blue: 255},
            visible: true,
            imageURL: imageProperties.path,
            alpha: backgroundAlpha
        };
        notify(notice, button, imageHeight, imageProperties, true);
    }

    return notificationText;
}

var CLOSE_NOTIFICATION_ICON = Script.resolvePath("assets/images/close-small-light.svg");

//  This function creates and sizes the overlays
function createNotification(text, notificationType, imageProperties) {
    var count = (text.match(/\n/g) || []).length,
        breakPoint = 43.0, // length when new line is added
        extraLine = 0,
        breaks = 0,
        height = 40.0,
        stack = 0,
        level,
        noticeProperties,
        bLevel,
        buttonProperties,
        i;

    if (text.length >= breakPoint) {
        breaks = count;
    }
    extraLine = breaks * 16.0;
    for (i = 0; i < heights.length; i += 1) {
        stack = stack + heights[i];
    }

    level = (stack + 20.0);
    height = height + extraLine;

    noticeProperties = {
        x: overlayLocationX,
        y: level,
        width: width,
        height: height,
        color: textColor,
        backgroundColor: backColor,
        alpha: backgroundAlpha,
        topMargin: topMargin,
        leftMargin: leftMargin,
        font: {size: fontSize},
        text: text
    };

    bLevel = level + 12.0;
    buttonProperties = {
        x: buttonLocationX,
        y: bLevel,
        width: 10.0,
        height: 10.0,
        subImage: { x: 0, y: 0, width: 10, height: 10 },
        imageURL: CLOSE_NOTIFICATION_ICON,
        color: { red: 255, green: 255, blue: 255},
        visible: true,
        alpha: backgroundAlpha
    };

    if (Menu.isOptionChecked(PLAY_NOTIFICATION_SOUNDS_MENU_ITEM) &&
        Menu.isOptionChecked(NotificationType.getMenuString(notificationType))) {
        randomSounds.playRandom();
    }

    return notify(noticeProperties, buttonProperties, height, imageProperties);
}

function deleteNotification(index) {
    var notificationTextID = notifications[index];
    if (notificationTextID == lodTextID) {
        lodTextID = false;
    }
    Overlays.deleteOverlay(notificationTextID);
    Overlays.deleteOverlay(buttons[index]);
    notifications.splice(index, 1);
    buttons.splice(index, 1);
    times.splice(index, 1);
    heights.splice(index, 1);
    myAlpha.splice(index, 1);
    overlay3DDetails.splice(index, 1);
    arrays.splice(index, 1);
}


// Trims extra whitespace and breaks into lines of length no more than MAX_LENGTH, breaking at spaces. Trims extra whitespace.
var MAX_LENGTH = 42;
function wordWrap(string) {
    var finishedLines = [], currentLine = '';
    string.split(/\s/).forEach(function (word) {
        var tail = currentLine ? ' ' + word : word;
        if ((currentLine.length + tail.length) <= MAX_LENGTH) {
            currentLine += tail;
        } else {
            finishedLines.push(currentLine);
            currentLine = word;
        }
    });
    if (currentLine) {
        finishedLines.push(currentLine);
    }
    return finishedLines.join('\n');
}

function update() {
    var nextOverlay,
        noticeOut,
        buttonOut,
        arraysOut,
        positions,
        i,
        j,
        k;

    if (isOnHMD !== HMD.active) {
        while (arrays.length > 0) {
            deleteNotification(0);
        }
        isOnHMD = !isOnHMD;
        persistTime = isOnHMD ? PERSIST_TIME_3D : PERSIST_TIME_2D;
        return;
    }

    frame += 1;
    if ((frame % 60.0) === 0) { // only update once a second
        locationY = 20.0;
        for (i = 0; i < arrays.length; i += 1) { //repositions overlays as others fade
            nextOverlay = Overlays.getOverlayAtPoint({ x: overlayLocationX, y: locationY });
            Overlays.editOverlay(notifications[i], { x: overlayLocationX, y: locationY });
            Overlays.editOverlay(buttons[i], { x: buttonLocationX, y: locationY + 12.0 });
            if (isOnHMD) {
                positions = calculate3DOverlayPositions(overlay3DDetails[i].width,
                                                        overlay3DDetails[i].height, locationY);
                overlay3DDetails[i].notificationOrientation = positions.notificationOrientation;
                overlay3DDetails[i].notificationPosition = positions.notificationPosition;
                overlay3DDetails[i].buttonPosition = positions.buttonPosition;
            }
            locationY = locationY + arrays[i][3];
        }
    }

    //  This checks the age of the notification and prepares to fade it after 9.0 seconds (var persistTime - 1)
    for (i = 0; i < arrays.length; i += 1) {
        if (ready) {
            j = arrays[i][2];
            k = j + persistTime;
            if (k < (new Date().getTime() / 1000)) {
                ready = false;
                noticeOut = arrays[i][0];
                buttonOut = arrays[i][1];
                arraysOut = i;
                fadeOut(noticeOut, buttonOut, arraysOut);
            }
        }
    }
}

var STARTUP_TIMEOUT = 500,  // ms
    startingUp = true,
    startupTimer = null;

function finishStartup() {
    startingUp = false;
    Script.clearTimeout(startupTimer);
}

function isStartingUp() {
    // Is starting up until get no checks that it is starting up for STARTUP_TIMEOUT
    if (startingUp) {
        if (startupTimer) {
            Script.clearTimeout(startupTimer);
        }
        startupTimer = Script.setTimeout(finishStartup, STARTUP_TIMEOUT);
    }
    return startingUp;
}

function onDomainConnectionRefused(reason) {
    createNotification("Connection refused: " + reason, NotificationType.CONNECTION_REFUSED);
}

function onEditError(msg) {
    createNotification(wordWrap(msg), NotificationType.EDIT_ERROR);
}

function onNotify(msg) {
    createNotification(wordWrap(msg), NotificationType.UNKNOWN); // Needs a generic notification system for user feedback, thus using this
}

function onSnapshotTaken(pathStillSnapshot, pathAnimatedSnapshot, notify) {
    if (notify) {
        var imageProperties = {
            path: "file:///" + pathStillSnapshot,
            aspectRatio: Window.innerWidth / Window.innerHeight
        };
        createNotification(wordWrap("Snapshot saved to " + pathStillSnapshot), NotificationType.SNAPSHOT, imageProperties);
    }
}

function tabletNotification() {
    createNotification("Tablet needs your attention", NotificationType.TABLET);
}

function processingGif() {
    createNotification("Processing GIF snapshot...", NotificationType.SNAPSHOT);
}

function connectionAdded(connectionName) {
    createNotification(connectionName, NotificationType.CONNECTION);
}

function connectionError(error) {
    createNotification(wordWrap("Error trying to make connection: " + error), NotificationType.CONNECTION);
}

//  handles mouse clicks on buttons
function mousePressEvent(event) {
    var pickRay,
        clickedOverlay,
        i;

    if (isOnHMD) {
        pickRay = Camera.computePickRay(event.x, event.y);
        clickedOverlay = Overlays.findRayIntersection(pickRay).overlayID;
    } else {
        clickedOverlay = Overlays.getOverlayAtPoint({ x: event.x, y: event.y });
    }

    for (i = 0; i < buttons.length; i += 1) {
        if (clickedOverlay === buttons[i]) {
            deleteNotification(i);
        }
    }
}

//  Control key remains active only while key is held down
function keyReleaseEvent(key) {
    if (key.key === 16777249) {
        ctrlIsPressed = false;
    }
}

//  Triggers notification on specific key driven events
function keyPressEvent(key) {
    if (key.key === 16777249) {
        ctrlIsPressed = true;
    }
}

function setup() {
    Menu.addMenu(MENU_NAME);
    var checked = Settings.getValue(PLAY_NOTIFICATION_SOUNDS_SETTING);
    checked = checked === '' ? true : checked;
    Menu.addMenuItem({
        menuName: MENU_NAME,
        menuItemName: PLAY_NOTIFICATION_SOUNDS_MENU_ITEM,
        isCheckable: true,
        isChecked: Settings.getValue(PLAY_NOTIFICATION_SOUNDS_SETTING)
    });
    Menu.addSeparator(MENU_NAME, "Play sounds for:");
    for (var type in NotificationType.properties) {
        checked = Settings.getValue(PLAY_NOTIFICATION_SOUNDS_TYPE_SETTING_PRE + (parseInt(type) + 1));
        checked = checked === '' ? true : checked;
        Menu.addMenuItem({
            menuName: MENU_NAME,
            menuItemName: NotificationType.properties[type].text + NOTIFICATION_MENU_ITEM_POST,
            isCheckable: true,
            isChecked: checked
        });
    }
}

//  When our script shuts down, we should clean up all of our overlays
function scriptEnding() {
    for (var i = 0; i < notifications.length; i++) {
        Overlays.deleteOverlay(notifications[i]);
        Overlays.deleteOverlay(buttons[i]);
    }
    Menu.removeMenu(MENU_NAME);
}

function menuItemEvent(menuItem) {
    if (menuItem === PLAY_NOTIFICATION_SOUNDS_MENU_ITEM) {
        Settings.setValue(PLAY_NOTIFICATION_SOUNDS_SETTING, Menu.isOptionChecked(PLAY_NOTIFICATION_SOUNDS_MENU_ITEM));
        return;
    }
    var notificationType = NotificationType.getTypeFromMenuItem(menuItem);
    if (notificationType !== notificationType.UNKNOWN) {
        Settings.setValue(PLAY_NOTIFICATION_SOUNDS_TYPE_SETTING_PRE + notificationType, Menu.isOptionChecked(menuItem));
    }
}

LODManager.LODDecreased.connect(function() {
    var warningText = "\n" +
        "Due to the complexity of the content, the \n" +
        "level of detail has been decreased. " +
        "You can now see: \n" +
        LODManager.getLODFeedbackText();

    if (lodTextID === false) {
        lodTextID = createNotification(warningText, NotificationType.LOD_WARNING);
    } else {
        Overlays.editOverlay(lodTextID, { text: warningText });
    }
});

Controller.keyPressEvent.connect(keyPressEvent);
Controller.mousePressEvent.connect(mousePressEvent);
Controller.keyReleaseEvent.connect(keyReleaseEvent);
Script.update.connect(update);
Script.scriptEnding.connect(scriptEnding);
Menu.menuItemEvent.connect(menuItemEvent);
Window.domainConnectionRefused.connect(onDomainConnectionRefused);
Window.snapshotTaken.connect(onSnapshotTaken);
Window.processingGif.connect(processingGif);
Window.connectionAdded.connect(connectionAdded);
Window.connectionError.connect(connectionError);
Window.notifyEditError = onEditError;
Window.notify = onNotify;
Tablet.tabletNotification.connect(tabletNotification);
setup();

}()); // END LOCAL_SCOPE
