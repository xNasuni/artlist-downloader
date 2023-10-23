// ==UserScript==
// @name        Artlist DL
// @namespace   http://tampermonkey.net/
// @description Allows you to download artlist.io Music & SFX
// @author      Mia @ github.com/xNasuni
// @match       *://*.artlist.io/*
// @grant       none
// @version     1
// @updateURL   https://github.com/xNasuni/artlist-downloader/raw/main/artlist-downloader.user.js
// @downloadURL https://github.com/xNasuni/artlist-downloader/raw/main/artlist-downloader.user.js
// @supportURL  https://github.com/xNasuni/artlist-downloader/issues
// ==/UserScript==
window.nativeFetch = window.fetch;

var LastSongPlayed = null

function GetRedirectedUrl(URL) {
    return new Promise(function (Resolve, Reject) {
        var XHR = new XMLHttpRequest()
        XHR.open('GET', URL)
        XHR.onload = function () {
            Resolve(XHR.responseURL)
        }
        XHR.onerror = function () {
            Reject(new Error('Failed to get redirected URL'))
        }
        XHR.send();
    })
}

function GetCurrentlyPlayingTitle() {
    return document.querySelector('div.mx-15>div.flex>div.text-white>a.truncate').innerText
}

function GetCurrentlyPlayingAuthor() {
    return document.querySelector('div.mx-15>div.flex>div.text-gray-200>a.truncate').innerText
}

async function HandleArtifact(URL) {
    var Yes = confirm(`Would you like to download ${GetCurrentlyPlayingTitle()} by ${GetCurrentlyPlayingAuthor()}?`)
    if (Yes) {
        try {
            const BlobData = new Blob([URL], { type: 'audio/aac' })
            const Handle = await window.showSaveFilePicker({ suggestedName: (await GetRedirectedUrl(URL)).split('/')[6], types: [{description: "AAC File (Compressed MP3)", accept: { "audio/aac": [".aac"]}}] })
            const Writable = await Handle.createWritable()
            await Writable.write(BlobData);
            await Writable.close();
        } catch (Err) {
            console.error(Err);
            var Element = document.createElement('a')
            Element.href = URL
            Element.download = URL
            document.body.appendChild(Element)
            Element.click()
            Element.remove()
        }
    }
}

window.hookedFetch = async function (RequestP, HeadersP) {
    var RequestCopy
    var ResponseCopy
    if (typeof RequestP == 'string') {

        if (RequestP.startsWith('https://cms-public-artifacts.artlist.io/') && RequestP != LastSongPlayed) { // Prevent Spam
            LastSongPlayed = RequestP
            HandleArtifact(RequestP)
        }

        RequestCopy = RequestP
        RequestCopy = new Request(RequestP, HeadersP)
        ResponseCopy = await window.nativeFetch(RequestCopy)
        ResponseCopy.requestInputObject = RequestCopy
    } else {
        ResponseCopy = await window.nativeFetch(RequestP, HeadersP)
    }
    if (typeof RequestP == 'object') {
        ResponseCopy.requestInputObject = RequestP
    } else {
        ResponseCopy.requestInputURL = RequestP
        ResponseCopy.requestInputObject = RequestCopy
    }

    if (HeadersP) { ResponseCopy.requestInputHeaders = HeadersP }

    return ResponseCopy

}
window.fetch = window.hookedFetch
