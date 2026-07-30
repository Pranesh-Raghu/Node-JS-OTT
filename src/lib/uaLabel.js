// Cheap, dependency-free "Chrome on macOS"-style label for a device list.
// Deliberately not a real UA parser (no npm dependency per the task's
// instructions) -- it will misclassify unusual/rare browsers, which is an
// acceptable trade-off for a cosmetic label.
'use strict';

function guessDeviceLabel(userAgent) {
    if (!userAgent) return 'Unknown device';

    let os = 'Unknown OS';
    if (/Windows NT/.test(userAgent)) os = 'Windows';
    else if (/Mac OS X/.test(userAgent)) os = 'macOS';
    else if (/Android/.test(userAgent)) os = 'Android';
    else if (/iPhone|iPad|iPod/.test(userAgent)) os = 'iOS';
    else if (/Linux/.test(userAgent)) os = 'Linux';

    let browser = 'Unknown browser';
    if (/Edg\//.test(userAgent)) browser = 'Edge';
    else if (/OPR\//.test(userAgent)) browser = 'Opera';
    else if (/Chrome\//.test(userAgent) && !/Chromium/.test(userAgent)) browser = 'Chrome';
    else if (/Firefox\//.test(userAgent)) browser = 'Firefox';
    else if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) browser = 'Safari';

    return `${browser} on ${os}`;
}

module.exports = { guessDeviceLabel };
