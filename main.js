(async function() {
    function DownloadURI(URI) {
        var Element = document.createElement('a')
        Element.href = URI
        Element.download = URI
        document.body.appendChild(Element)
        Element.click()
        Element.remove()
    }

    function GetCurrentAudioURI() {
        if (document.getElementsByTagName('audio')[0].src != '') {
            return document.getElementsByTagName('audio')[0].src
        } else {
            return document.getElementsByTagName('audio')[1].src
        }
    }

    var CurrentAudioURI = GetCurrentAudioURI()
    
    DownloadURI(CurrentAudioURI)
})()
