
window.addEventListener('message', function(event) {
    if (event.origin != window.location.origin) {
        return;
    }

    onMessageCallback(event.data);
});

// and the function that handles received messages

function onMessageCallback(data) {
    // "cancel" button is clicked
    if (data == 'PermissionDeniedError') {
        chromeMediaSource = 'PermissionDeniedError';
        if (screenCallback) return screenCallback('PermissionDeniedError');
        else throw new Error('PermissionDeniedError');
    }

    // extension notified his presence
    if (data == 'rtcmulticonnection-extension-loaded') {
        chromeMediaSource = 'desktop';
    }

    // extension shared temp sourceId
    if (data.sourceId && screenCallback!=null) {
	    var tmpSourceId = data.sourceId;
        screenCallback(sourceId = tmpSourceId);
        screenCallback=null;
    }
}

// global variables
var chromeMediaSource = 'screen';
//var sourceID;
var sourceId=null;
var screenCallback;

// this method can be used to check if chrome extension is installed & enabled.
function isChromeExtensionAvailable(callback) {
    if (!callback) return;

    if (chromeMediaSource == 'desktop') return callback(true);

    // ask extension if it is available
    window.postMessage('are-you-there', '*');

    setTimeout(function() {
        if (chromeMediaSource == 'screen') {
            callback(false);
        } else callback(true);
    }, 2000);
}

// this function can be used to get "source-id" from the extension
function getSourceId(callback) {
    if (!callback) throw 'callback" parameter is mandatory.';
    // modified in order to accomodate use case of switching presenters in order to select their screens everytime the extension is called
    if(sourceId!=null)
    {
	    sourceId = null;
    }
    
    screenCallback = callback;
    window.postMessage('get-sourceId', '*');
}

var isFirefox = typeof window.InstallTrigger !== 'undefined';
var isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
var isChrome = !!window.chrome && !isOpera;

function getChromeExtensionStatus(extensionid, callback) {
    if (isFirefox) return callback('not-chrome');

    if (arguments.length != 2) {
        callback = extensionid;
        extensionid = 'ajhifddimkapgcifgcodmmfdlknahffk'; // default extension-id
    }

    var image = document.createElement('img');
    image.src = 'chrome-extension://' + extensionid + '/icon.png';
    image.onload = function() {
        chromeMediaSource = 'screen';
        window.postMessage('are-you-there', '*');
        setTimeout(function() {
            if (chromeMediaSource == 'screen') {
                callback(extensionid == extensionid ? 'installed-enabled' : 'installed-disabled');
            } else callback('installed-enabled');
        }, 2000);
    };
    image.onerror = function() {
        callback('not-installed');
    };
}

// this function explains how to use above methods/objects

/*function getScreenConstraints(callback) {
    var firefoxScreenConstraints = {
        mozMediaSource: 'window',
        mediaSource: 'window'
    };
    
    if(isFirefox) return callback(firefoxScreenConstraints);

    // this statement defines getUserMedia constraints
    // that will be used to capture content of screen
    var screen_constraints = {
        mandatory: {
            chromeMediaSource: chromeMediaSource,
            maxWidth: screen.width > 1920 ? screen.width : 1920,
            maxHeight: screen.height > 1080 ? screen.height : 1080
        },
        optional: []
    };

    // this statement verifies chrome extension availability
    // if installed and available then it will invoke extension API
    // otherwise it will fallback to command-line based screen capturing API
    if (chromeMediaSource == 'desktop' && !sourceId) {
        getSourceId(function() {
            screen_constraints.mandatory.chromeMediaSourceId = sourceId;
            callback(screen_constraints);
        });
        return;
    }

    // this statement sets gets 'sourceId" and sets "chromeMediaSourceId" 
    if (chromeMediaSource == 'desktop') {
        screen_constraints.mandatory.chromeMediaSourceId = sourceId;
    }

    // now invoking native getUserMedia API
    callback(screen_constraints);
}*/

  function getScreenConstraints(sourceId, callback) {
        console.log("=== window.getScreenShare === " + JSON.stringify(sourceId, null, 4));
        console.log("=== window.idSource === " + JSON.stringify(window.idSource, null, 4));
        var screen_constraints = {
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'screen',
                    maxWidth: window.screen.width > 1920 ? window.screen.width : 1920,
                    maxHeight: window.screen.height > 1080 ? window.screen.height : 1080

                },
                optional: []
            }
        };
       
        console.log("=== window.constraintsError === " + JSON.stringify(window.constraintsError, null, 4));
        return callback(window.constraintsError, screen_constraints);
    }

    

    window.getScreenShare = function getScreenConstraints(sourceId, callback) {
        console.log("=== window.getScreenShare === " + JSON.stringify(sourceId, null, 4));
        console.log("=== window.idSource === " + JSON.stringify(window.idSource, null, 4));
        var screen_constraints = {
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'screen',
                    maxWidth: window.screen.width > 1920 ? window.screen.width : 1920,
                    maxHeight: window.screen.height > 1080 ? window.screen.height : 1080

                },
                optional: []
            }
        };
       
        console.log("=== window.constraintsError === " + JSON.stringify(window.constraintsError, null, 4));
        return callback(window.constraintsError, screen_constraints);
}


