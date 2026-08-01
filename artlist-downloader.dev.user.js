// ==UserScript==
// @name        Artlist DL
// @namespace   http://tampermonkey.net/
// @description Allows you to download artlist.io Music & SFX
// @author      Mia @ github.com/xNasuni
// @match       *://*.artlist.io/*
// @grant       GM_xmlhttpRequest
// @connect     cms-public-artifacts.artlist.io
// @connect     cms-artifacts.artlist.io
// @require     https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @version     3.0
// @run-at	    document-start
// @updateURL   https://github.com/xNasuni/artlist-downloader/raw/main/artlist-downloader.user.js
// @downloadURL https://github.com/xNasuni/artlist-downloader/raw/main/artlist-downloader.user.js
// @supportURL  https://github.com/xNasuni/artlist-downloader/issues
// ==/UserScript==

const LoadedMusicLists = []
const LoadedSfxLists = []
const LoadedSfxsList = []
const LoadedSongsList = []
const LoadedSstemsLists = []
const ModifiedMusicButtonColor = '#82ff59'
const ModifiedSfxButtonColor = '#ff90bf'
const ErrorButtonColor = '#ff3333'
const UNKNOWN_DATATYPE = '_unknown'
const NEXTRSC_DATATYPE = '_rsc'
const SINGLE_SOUND_EFFECT_DATATYPE = '_ssfx'
const SINGLE_SONG_DATATYPE = '_ssong'
const MUSIC_ALBUM_PAGETYPE = '_amusic'
const SONGS_PAGETYPE = '_songs'
const MUSIC_PAGETYPE = '_music'
const SFXS_PAGETYPE = '_sfxs'
const SFXP_PAGETYPE = '_sfxp'
const SFX_PAGETYPE = '_sfx'
const SONG_STEMS_PAGETYPE = '_sstem'
const oldXMLHttpRequestOpen = unsafeWindow.XMLHttpRequest.prototype.open
const oldFetch = unsafeWindow.fetch

var AudioTable
var TBody
var LastChangeObserver
var ActionContainer
var SongPage
var LastInterval = -1
var RequestsInterval = -1
var RSCInterval = -1
var DontPoll = false
var SingleSoundEffectData = 'none'
var SingleSongData = 'none'

async function ShowSaveFilePickerForURL(url, filename) {
    if (!url) {
        throw new Error('no url passed in')
    }

    let blobDataFromURL = null

    if (typeof GM_xmlhttpRequest !== 'undefined') {
        blobDataFromURL = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
					Referer: 'https://artlist.io/',
					["Sec-Fetch-Dest"]: 'audio',
					["Sec-Fetch-Mode"]: 'cors',
					["Sec-Fetch-Site"]: 'same-site',
					Accept: 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
					["Accept-Language"]: 'en-US,en;q=0.9',
					["Accept-Encoding"]: 'identity'
                },
                responseType: 'blob',
                onload: res => {
                    if (res.response) resolve(res.response)
                    else reject(new Error('empty response'))
                },
                onerror: err => reject(err)
            })
        })
    } else {
        console.warn('using native fetch, GM_xmlhttpRequest not found')
        blobDataFromURL = await fetch(url, {
            headers: {
                Referer: 'https://artlist.io/'
            }
        }).then(r => r.blob())
    }

    try {
        if (unsafeWindow.showSaveFilePicker) {
            const BlobData = new Blob([blobDataFromURL], {
                type: 'audio/aac'
            })
            const Handle = await unsafeWindow.showSaveFilePicker({
                suggestedName: filename,
                types: [
                    {
                        description: 'AAC File (Compressed MP3)',
                        accept: {
                            'audio/aac': ['.aac']
                        }
                    }
                ]
            })
            const Writable = await Handle.createWritable()
            await Writable.write(BlobData)
            await Writable.close()
        } else {
            const blobURL = URL.createObjectURL(blobDataFromURL)
            const a = document.createElement('a')
            a.href = blobURL
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(blobURL)
        }
    } catch (e) {
        console.error('Error saving file:', e)
    }
}

async function ShowSaveFilePickerForURLsZipped(files, filename) {
    try {
        const zip = new JSZip()

        for (const file of files) {
            const blobDataFromURL = await fetch(file.URL).then(r => r.blob())
            zip.file(file.Filename, blobDataFromURL)
        }

        const zipBlob = await zip.generateAsync({
            type: 'blob'
        })
        if (unsafeWindow.showSaveFilePicker) {
            const handle = await unsafeWindow.showSaveFilePicker({
                suggestedName: filename,
                types: [
                    {
                        description: 'ZIP File',
                        accept: {
                            'application/zip': ['.zip']
                        }
                    }
                ]
            })

            const writable = await handle.createWritable()
            await writable.write(zipBlob)
            await writable.close()
        } else {
            const blobURL = URL.createObjectURL(zipBlob)
            const a = document.createElement('a')
            a.href = blobURL
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(blobURL)
        }
    } catch (e) {
        console.warn('Error saving zip:', e)
    }
}

function Until(testFunc) {
    // https://stackoverflow.com/a/52657929
    const poll = resolve => {
        if (DontPoll) {
            resolve()
        }
        if (testFunc()) {
            resolve()
        } else setTimeout(_ => poll(resolve), 100)
    }
    return new Promise(poll)
}

function GetPagetype() {
    const PathSplit = unsafeWindow.location.pathname.split('/')
    if (
        unsafeWindow.location.host === 'artlist.io' &&
        PathSplit[1] === 'royalty-free-music' &&
        (PathSplit[2] === 'song' || PathSplit[2] === 'artist')
    ) {
        return SONGS_PAGETYPE
    }
    if (
        unsafeWindow.location.host === 'artlist.io' &&
        PathSplit[1] === 'royalty-free-music' &&
        PathSplit[2] === 'album'
    ) {
        return MUSIC_ALBUM_PAGETYPE
    }
    if (
        unsafeWindow.location.host === 'artlist.io' &&
        PathSplit[1] === 'royalty-free-music'
    ) {
        return MUSIC_PAGETYPE
    }
    if (
        unsafeWindow.location.host === 'artlist.io' &&
        PathSplit[1] === 'sfx' &&
        PathSplit[2] === 'track'
    ) {
        return SFXS_PAGETYPE
    }
    if (
        unsafeWindow.location.host === 'artlist.io' &&
        PathSplit[1] === 'sfx' &&
        PathSplit[2] === 'pack'
    ) {
        return SFXP_PAGETYPE
    }
    if (
        unsafeWindow.location.host == 'artlist.io' &&
        (PathSplit[1] === 'sfx' ||
            (PathSplit[1] === 'sfx' &&
                (PathSplit[2] === 'search' || PathSplit[2] === 'pack')))
    ) {
        return SFX_PAGETYPE
    }
    return UNKNOWN_DATATYPE
}

function GetDatatype(Data) {
    var Datatype = UNKNOWN_DATATYPE

    try {
        if (
            Data.data.sfxList != undefined &&
            Data.data.sfxList.songs != undefined
        ) {
            Datatype = SFX_PAGETYPE
        }
    } catch (e) {}
    try {
        if (
            Data.data.songList != undefined &&
            Data.data.songList.songs != undefined
        ) {
            Datatype = MUSIC_PAGETYPE
        }
    } catch (e) {}
    try {
        if (
            Data.data.sfxs != undefined &&
            Data.data.sfxs.length === 1 &&
            Data.data.sfxs[0].similarList != undefined
        ) {
            Datatype = SFXS_PAGETYPE
        }
    } catch (e) {}
    try {
        if (Data.data.pack != undefined && Data.data.pack.songs != undefined) {
            Datatype = SFXP_PAGETYPE
        }
    } catch (e) {}
    try {
        if (
            Data.data.sfxs != undefined &&
            Data.data.sfxs.length === 1 &&
            Data.data.sfxs[0].songName != undefined
        ) {
            Datatype = SINGLE_SOUND_EFFECT_DATATYPE
        }
    } catch (e) {}
    try {
        if (
            Data.data.songs != undefined &&
            Data.data.songs.length === 1 &&
            Data.data.songs[0].songName != undefined
        ) {
            Datatype = SINGLE_SONG_DATATYPE
        }
    } catch (e) {}
    try {
        if (
            Data.data.songs != undefined &&
            Data.data.songs.length === 1 &&
            Data.data.songs[0].similarSongs != undefined
        ) {
            Datatype = SONGS_PAGETYPE
        }
    } catch (e) {}

    try {
        if (
            Data.data.songs != undefined &&
            Data.data.songs.length === 1 &&
            Data.data.songs[0].stems != undefined
        ) {
            Datatype = SONG_STEMS_PAGETYPE
        }
    } catch (e) {}

    return Datatype
}

function MatchURL(Url) {
    const Pagetype = GetPagetype()
    let URLObject

    try {
        URLObject = new URL(Url)
    } catch (e) {
        return UNKNOWN_DATATYPE
    }

    const hasRsc = URLObject.searchParams.has('_rsc')
    if (hasRsc) {
        return NEXTRSC_DATATYPE
    }

    if (
        Pagetype !== UNKNOWN_DATATYPE &&
        URLObject.host === 'search-api.artlist.io' &&
        (URLObject.pathname === '/v1/graphql' ||
            URLObject.pathname === '/v2/graphql')
    ) {
        return Pagetype
    }

    return UNKNOWN_DATATYPE
}

async function GetSfxInfo(Id) {
    const Query = `query Sfxs($ids: [Int!]!) {
  sfxs(ids: $ids) {
    songId
    songName
    artistId
    artistName
    albumId
    albumName
    assetTypeId
    duration
    sitePlayableFilePath
  }
}
`
    const Variables = {
        ids: [Id]
    }

    const Payload = {
        query: Query,
        variables: Variables
    }

    const Response = await fetch('https://search-api.artlist.io/v1/graphql', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(Payload)
    })
    const JSONData = await Response.json()

    var Data

    try {
        Data = JSONData.data.sfxs[0]
    } catch (e) {}

    if (Data === undefined) {
        return false
    }

    return Data
}

async function GetSongInfo(Id) {
    const Query = `query Songs($ids: [String!]!) {
  songs(ids: $ids) {
    songId
    songName
    artistId
    artistName
    albumId
    albumName
    assetTypeId
    duration
    sitePlayableFilePath
  }
}
`
    const Variables = {
        ids: [Id.toString()]
    }

    const Payload = {
        query: Query,
        variables: Variables
    }

    const Response = await fetch('https://search-api.artlist.io/v1/graphql', {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify(Payload)
    })
    const JSONData = await Response.json()

    var Data

    try {
        Data = JSONData.data.songs[0]
    } catch (e) {}

    if (Data === undefined) {
        return false
    }

    return Data
}

async function LoadAssetInfo(Id) {
    const Pagetype = GetPagetype()
    if (Pagetype === SFXS_PAGETYPE) {
        SingleSoundEffectData = await GetSfxInfo(Id)
        return true
    }
    if (Pagetype === SONGS_PAGETYPE) {
        SingleSongData = await GetSongInfo(Id)
        return true
    }
    return false
}

function GetAudioTable() {
    return unsafeWindow.document.querySelector(
        'table.w-full.table-fixed[data-testid=AudioTable]'
    )
}

function GetSongPage() {
    return (
        unsafeWindow.document.querySelector('div[data-testid=SongPage]') ||
        unsafeWindow.document.querySelector('div#song-page-react')
    )
}

function GetBanner(SongPage) {
    return SongPage.querySelector('div')
}

function GetActionRow(SongPage) {
    if (window.innerWidth >= 1024) {
        // page layout changes depending on viewport size
        return SongPage.querySelector('div.hidden')
    }
    return SongPage.querySelector('div.block.py-4.px-6')
}

function GetTBody() {
    return (
        unsafeWindow.document.querySelector(
            'div.w-full[data-testid=ComposableAudioList]'
        ) ||
        unsafeWindow.document.querySelector(
            'table[data-testid=AudioTable]>tbody'
        )
    )
}

function GetTBodyEdgeCase() {
    const TBody =
        unsafeWindow.document.querySelector('div[data-testid=Wrapper]') ||
        unsafeWindow.document.querySelector('div[data-testid=ArtistContent]') ||
        unsafeWindow.document.querySelector('div#song-page-tab-panel-1') ||
        unsafeWindow.document.querySelector(
            'div[data-testid=ComposableAudioList]'
        )
    if (TBody === null) {
        return
    }
    if (TBody.parentNode.classList.contains('hidden')) {
        return
    }
    if (
        TBody.querySelector(
            '[data-testid=AudioRow], [data-testid=AlbumRow], [data-testid=SongVariantsWrapper]'
        ) == null
    ) {
        return
    }

    return TBody
}

function GetAudioRowData(AudioRow, Pagetype) {
    var Data = {
        AudioTitle: 'none',
        RawTitle: 'None',
        Artists: [],
        Button: null,
        Pagetype: Pagetype
    }
    var AlbumsAndArtists = AudioRow.querySelector(
        'td[data-testid=AlbumsAndArtists]'
    )
    var DataAndActions = AudioRow.querySelector(
        'td[data-testid=DataAndActions]'
    )

    if (Pagetype === SONGS_PAGETYPE) {
        AlbumsAndArtists = AudioRow.querySelector(
            'div[data-testid=AudioDetails]'
        )
        DataAndActions = AudioRow.querySelector(
            'div[data-testid=AnimatedToggleContainer]'
        )
    }

    if (Pagetype == MUSIC_PAGETYPE || Pagetype == MUSIC_ALBUM_PAGETYPE) {
        AlbumsAndArtists = AudioRow.querySelector(
            'div.flex[data-testid=AudioDetails]'
        )
        DataAndActions = AudioRow.querySelector(
            'div[data-testid=AnimatedToggleContainer]'
        )
    }

    if (
        DataAndActions == null &&
        AudioRow.querySelector('span[data-testid=stems-player-stem-name]') &&
        AudioRow.parentNode.getAttribute('data-testid') != 'ComposableAudioList'
    ) {
        // most likely a song stem, so default to audio row
        const StemContainer = AudioRow.parentNode.parentNode
        const Title = StemContainer.querySelector(
            'span[data-testid=stems-player-song-name]'
        )
        const Artists = StemContainer.querySelectorAll(
            'span[data-testid=stems-player-song-artist]'
        )

        Data.Pagetype = SONG_STEMS_PAGETYPE
        Data.AudioTitle = `${AudioRow.querySelector('span[data-testid=stems-player-stem-name]').innerText} of ${Title.innerText}`
        Data.RawTitle = AudioRow.querySelector(
            'span[data-testid=stems-player-stem-name]'
        ).innerText

        for (const Artist of Artists) {
            Data.Artists.push(Artist.innerText)
        }

        DataAndActions = AudioRow
    }

    if (!DataAndActions) {
        console.warn('DataAndActions not found in', Pagetype, AudioRow)
    }

    var Button =
        DataAndActions.querySelector("button[aria-label='download']") ||
        DataAndActions.querySelector("button[aria-label='Download']")

    if (Button) {
        Data.Button = Button
    }

    if (AlbumsAndArtists == null || DataAndActions == null) {
        return Data
    }

    const AudioTitle = AlbumsAndArtists.querySelector(
        'a.truncate[data-testid=Link]'
    )
    const Artists = AlbumsAndArtists.querySelectorAll(
        'a.truncate.text-gray-200[data-testid=Link]'
    )

    if (AudioTitle) {
        Data.AudioTitle = AudioTitle.childNodes[0].textContent.trim()
        Data.RawTitle = Data.AudioTitle
    }
    if (Artists) {
        for (const Artist of Artists) {
            Data.Artists.push(Artist.textContent.replaceAll(',', '').trim())
        }
    }

    if (
        Data.AudioTitle === 'none' &&
        Data.Artists.length === 0 &&
        Data.Button == null
    ) {
        return false
    }
    if (
        (Data.AudioTitle === 'none' || Data.Artists.length === 0) &&
        Data.Button !== null
    ) {
        Data.Button.style.color = ErrorButtonColor
    }

    return Data
}

function GetBannerData(SongPage, Pagetype) {
    const Data = {
        AudioTitle: 'none',
        RawTitle: 'none',
        Artists: [],
        Button: null,
        Pagetype: Pagetype
    }

    const Banner = GetBanner(SongPage)
    const ActionRow = GetActionRow(SongPage)

    if (Banner === null || ActionRow === null) {
        return false
    }

    const Titles = Banner.querySelectorAll('h1')
    const Artists = Banner.querySelectorAll('a[data-testid=Link]')
    const Button = ActionRow.querySelector(
        "button[aria-label='direct download']"
    )

    if (Titles.length != 1 || Artists.length <= 0 || Button == null) {
        return Data
    }

    Data.AudioTitle = Titles[0].textContent
    Data.RawTitle = Data.AudioTitle
    Data.Button = Button

    for (const Artist of Artists) {
        Data.Artists.push(Artist.textContent.replaceAll(',', '').trim())
    }

    if (
        Data.AudioTitle === 'none' &&
        Data.Artists.length == 0 &&
        Data.Button == null
    ) {
        return false
    }
    if (
        (Data.AudioTitle === 'none' || Data.Artists.length == 0) &&
        Data.Button != null
    ) {
        Data.Button.style.color = ErrorButtonColor
        Data.Button.style.borderColor = ErrorButtonColor
    }

    return Data
}

function MakeFilename(AssetData, Pagetype) {
    const NoAlbum = AssetData.albumId === undefined
    return `${Pagetype === MUSIC_PAGETYPE || Pagetype === SONGS_PAGETYPE || Pagetype === SONG_STEMS_PAGETYPE ? (Pagetype == SONG_STEMS_PAGETYPE ? 'Music Stem' : 'Music') : 'Sfx'} ${AssetData.artistName} - ${AssetData.songName} ${AssetData.songName != AssetData.albumName ? `on ${AssetData.albumName} ` : ''}(${AssetData.artistId}.${NoAlbum ? '' : AssetData.albumId + '.'}${AssetData.songId})`
}

function WriteAudio(RowData, AudioData) {
    const Pagetype = RowData.Pagetype
    const ChosenColor =
        Pagetype === MUSIC_ALBUM_PAGETYPE ||
        Pagetype === MUSIC_PAGETYPE ||
        Pagetype === SONGS_PAGETYPE ||
        Pagetype == SONG_STEMS_PAGETYPE
            ? ModifiedMusicButtonColor
            : ModifiedSfxButtonColor
    const FileName = MakeFilename(AudioData, Pagetype)
    RowData.Button.setAttribute('artlist-dl-processed', 'true')
    RowData.Button.style.color = ChosenColor
    RowData.Button.addEventListener(
        'click',
        function (event) {
            event.stopImmediatePropagation() // prevent premium popup upsell
            ShowSaveFilePickerForURL(
                AudioData.sitePlayableFilePath || AudioData.playableFileUrl,
                FileName + '.aac'
            )
        },
        true
    )
}

function WriteBanner(BannerData, AudioData) {
    const Pagetype = BannerData.Pagetype
    const ChosenColor =
        Pagetype === MUSIC_PAGETYPE ||
        Pagetype === SONGS_PAGETYPE ||
        Pagetype == SONG_STEMS_PAGETYPE
            ? ModifiedMusicButtonColor
            : ModifiedSfxButtonColor
    const FileName = MakeFilename(AudioData, Pagetype)
    BannerData.Button.setAttribute('artlist-dl-processed', 'true')
    BannerData.Button.style.color = ChosenColor
    BannerData.Button.style.borderColor = ChosenColor
    BannerData.Button.addEventListener(
        'click',
        function (event) {
            event.stopImmediatePropagation() // prevent premium popup upsell
            ShowSaveFilePickerForURL(
                AudioData.sitePlayableFilePath || AudioData.playableFileUrl,
                FileName + '.aac'
            )
        },
        true
    )
}

var changeBackTimeout = -1
function WriteDownloadAllStems(StemsContainer, DownloadButton) {
    const Pagetype = GetPagetype()
    const ChosenColor = ModifiedMusicButtonColor
    DownloadButton.setAttribute('artlist-dl-processed', 'true')
    DownloadButton.style.backgroundColor = ChosenColor
    DownloadButton.style.borderColor = ChosenColor
    DownloadButton.style.color = 'black'
    DownloadButton.addEventListener('click', async function (event) {
        event.stopImmediatePropagation() // prevent dropdown
        clearInterval(changeBackTimeout)
        changeBackTimeout = setTimeout(() => {
            DownloadButton.querySelector('span.whitespace-nowrap').innerText =
                'Download All Stems'
            DownloadButton.disabled = false
        }, 10000)
        DownloadButton.querySelector('span.whitespace-nowrap').innerText =
            'Please Wait...'
        DownloadButton.disabled = true
        const dataList = []
        var firstData = null
        for (const StemDescendant of StemsContainer.querySelectorAll(
            'span[data-testid=stems-player-stem-name]'
        )) {
            const Stem = StemDescendant.parentNode
            try {
                const AudioData = GetAudioDataFromRowData(
                    GetAudioRowData(Stem, SONG_STEMS_PAGETYPE)
                )
                if (!firstData) {
                    firstData = AudioData
                }

                dataList.push({
                    URL:
                        AudioData.sitePlayableFilePath ||
                        AudioData.playableFileUrl,
                    Filename:
                        MakeFilename(AudioData, SONG_STEMS_PAGETYPE) + '.aac'
                })
            } catch (e) {
                console.warn('Exception while handling stem rows:', e)
            }
        }

        const fileName = `Music Stems ${firstData.artistName} - ${firstData._songName}${firstData._songName == firstData._albumName ? '' : ` on ${firstData._albumName}`}.zip`
        await ShowSaveFilePickerForURLsZipped(dataList, fileName)
        clearInterval(changeBackTimeout)
        DownloadButton.querySelector('span.whitespace-nowrap').innerText =
            'Download All Stems'
        DownloadButton.disabled = false
    })
}

function MatchAudioToRow(AudioData, RowData, SkipArtistCheck) {
    return (
        (AudioData.songName || AudioData.name).trim() ===
            RowData.RawTitle.trim() &&
        (SkipArtistCheck ||
            RowData.Artists.indexOf(AudioData.artistName.trim()) != -1)
    )
}

function OnRowAdded(AudioRow, RowData, AudioData) {
    AudioRow.setAttribute('artlist-dl-state', 'modified')
    if (AudioData !== undefined) {
        WriteAudio(RowData, AudioData)
    } else {
        console.warn('No data given for row', RowData)
        if (RowData.Button !== null) {
            RowData.Button.style.color = ErrorButtonColor
        }
    }
}

function cloneref(object) {
    return {
        ...object
    }
}

function transformIndexedObject2Array(object) {
    return Object.values(object)
}

function GetAudioDataFromRowData(RowData) {
    if (RowData.Pagetype === SFX_PAGETYPE) {
        if (LoadedSfxLists.length <= 0) {
            console.warn('No loaded sound effects to loop through.')
            return
        }
        for (const SfxList of LoadedSfxLists) {
            for (const SfxData of SfxList) {
                if (MatchAudioToRow(SfxData, RowData)) {
                    return SfxData
                }
            }
        }
    }
    if (
        RowData.Pagetype === MUSIC_PAGETYPE ||
        RowData.Pagetype === MUSIC_ALBUM_PAGETYPE
    ) {
        if (LoadedMusicLists.length <= 0) {
            console.warn('No loaded songs to loop through.')
            return
        }
        for (const MusicList of LoadedMusicLists) {
            for (const SongData of MusicList) {
                if (MatchAudioToRow(SongData, RowData)) {
                    return SongData
                }
            }
        }
    }
    if (
        RowData.Pagetype === SFXS_PAGETYPE ||
        RowData.Pagetype === SFXP_PAGETYPE ||
        RowData.Pagetype == SONGS_PAGETYPE
    ) {
        if (LoadedSfxsList.length <= 0) {
            console.warn('No loaded sfxs to loop through.')
            return
        }
        for (const SfxsList of LoadedSfxsList) {
            for (const SfxData of SfxsList) {
                if (MatchAudioToRow(SfxData, RowData)) {
                    return SfxData
                }
            }
        }
    }
    if (RowData.Pagetype === SONGS_PAGETYPE) {
        if (LoadedSongsList.length <= 0) {
            console.warn('No loaded similar songs to loop through.')
            return
        }
        for (const SongsList of LoadedSongsList) {
            for (const SongData of SongsList) {
                if (MatchAudioToRow(SongData, RowData)) {
                    return SongData
                }
            }
        }
    }
    if (RowData.Pagetype === SONG_STEMS_PAGETYPE) {
        if (LoadedSstemsLists.length <= 0) {
            console.warn('No loaded song stems to loop through.')
            return
        }
        for (const StemData of LoadedSstemsLists) {
            for (const Stem of StemData.stems) {
                if (MatchAudioToRow(Stem, RowData, true)) {
                    const clonedData = cloneref(StemData)
                    clonedData.sitePlayableFilePath = Stem.playableFileUrl
                    clonedData._songName = clonedData.songName
                    clonedData._albumName = clonedData.albumName
                    clonedData.songName = `${Stem.name} of ${StemData.songName}`
                    clonedData.albumName = `${Stem.name} of ${StemData.albumName}`
                    return clonedData
                }
            }
        }
    }

    console.warn("Couldn't handle data:", RowData)
}

function HandleJSONData(Data) {
    const Datatype = GetDatatype(Data)
    if (Datatype === SONGS_PAGETYPE) {
        LoadedSongsList.push(Data.data.songs[0].similarSongs)
        return
    }
    if (Datatype === MUSIC_PAGETYPE) {
        LoadedMusicLists.push(Data.data.songList.songs)
        return
    }
    if (Datatype === SFXS_PAGETYPE) {
        LoadedSfxsList.push(Data.data.sfxs[0].similarList)
        return
    }
    if (Datatype == SFXP_PAGETYPE) {
        LoadedSfxsList.push(Data.data.pack.songs)
        return
    }
    if (Datatype === SFX_PAGETYPE) {
        LoadedSfxLists.push(Data.data.sfxList.songs)
        return
    }
    if (
        Datatype === SONG_STEMS_PAGETYPE &&
        Data.data.songs &&
        Data.data.songs[0] &&
        Data.data.songs[0].stems
    ) {
        LoadedSstemsLists.push(Data.data.songs[0])
        return
    }

    console.warn('Not processed:', Datatype, Data)
}

function HandleRSCEntry(DataStr) {
    var Data = null

    const [_, right] = DataStr.split(/:(.+)/)

    Data = JSON.parse(right)

    var found = null

    for (const k in Data) {
        const v = Data[k]

        if (
            v &&
            typeof v === 'object' &&
            ('artistSongs' in v ||
                'songData' in v ||
                'pack' in v ||
                'album' in v ||
                v?.data?.sfxs)
        ) {
            found = v
        }
    }

    if (!found) {
        throw new Error('no audio data found')
    }

    try {
        const datatype = GetDatatype(found)
        if (datatype != UNKNOWN_DATATYPE) {
            HandleJSONData(found)
            return
        }

        if (!!found.album) {
            HandleJSONData({
                data: {
                    songList: {
                        songs: found.album.songs
                    }
                }
            })
        }

        if (!!found.pack) {
            HandleJSONData({
                data: {
                    pack: found.pack
                }
            })
        }

        if (!!found.songData) {
            HandleJSONData({
                data: {
                    sfxs: [
                        {
                            similarList: [found.songData]
                        }
                    ]
                }
            })
        }
        if (!!found.artistSongs) {
            for (var song of found.artistSongs) {
                song.songId = song.audioDetails.audioId
                song.songName = song.audioDetails.audioName
                song.artistName = song.audioDetails.artists[0].name
                song.artistId = song.audioDetails.artists[0].id
                song.sitePlayableFilePath = song.audioUrl
            }
            HandleJSONData({
                data: {
                    sfxList: {
                        page: 1,
                        songs: transformIndexedObject2Array(found.artistSongs),
                        suggestion: []
                    }
                }
            })
        }
    } catch (e) {
        console.warn(found)
        console.error(e)
        alert(
            `Artlist Downloader: please report this in https://github.com/xNasuni/artlist-downloader\n#HNRSC>${String(e)}`
        )
        throw e
    }
}

function HookNextRSC() {
    var oldNextFPush = null
    var handler = function () {
        try {
            const Container = arguments[0]
            if (Container[0] != 1) {
                throw new Error('invalid format')
            }

            const DataStr = Container[1]
            HandleRSCEntry(DataStr)
        } catch (e) {}

        return oldNextFPush.apply(this, arguments)
    }

    if (RSCInterval != -1) {
        clearInterval(RSCInterval)
    }
    RSCInterval = setInterval(() => {
        if (!unsafeWindow.__next_f || !unsafeWindow.__next_f.push) {
            return
        }
        if (unsafeWindow.__next_f.push == handler) {
            return
        }

        oldNextFPush = unsafeWindow.__next_f.push
        unsafeWindow.__next_f.push = handler
    })
}

function HandleListRSC(responseText) {
    const Entries = responseText.split('\n').filter(v => !v.trim() == '')

    for (var Entry of Entries) {
        try {
            HandleRSCEntry(Entry)
        } catch (e) {}
    }
}

function ApplyXHR(XHR, Datatype) {
    if (Datatype !== UNKNOWN_DATATYPE) {
        XHR.addEventListener('readystatechange', function () {
            if (XHR.readyState == XMLHttpRequest.DONE) {
                if (Datatype == NEXTRSC_DATATYPE) {
                    HandleListRSC(XHR.responseText)
                } else {
                    var JSONData
                    try {
                        JSONData = JSON.parse(XHR.responseText)
                    } catch (e) {
                        console.warn(
                            `Couldn't parse as json: ${XHR.responseText}`
                        )
                        return
                    }
                    HandleJSONData(JSONData)
                }
            }
        })
    }
}

function HookRequests() {
    var handler = function () {
        const Method = arguments[0]
        const URL = arguments[1]

        const UrlDatatype = MatchURL(URL)
        if (UrlDatatype != UNKNOWN_DATATYPE) {
            ApplyXHR(this, UrlDatatype)
        }

        return oldXMLHttpRequestOpen.apply(this, arguments)
    }
    var handler_fetch = async function () {
        const URL = arguments[0]

        const data = await oldFetch.apply(this, arguments)

        const UrlDatatype = MatchURL(URL)
        if (UrlDatatype != UNKNOWN_DATATYPE) {
            const text = await data.clone().text()
            HandleListRSC(text)
        }

        return data
    }

    if (RequestsInterval != -1) {
        clearInterval(RequestsInterval)
    }
    RequestsInterval = setInterval(() => {
        unsafeWindow.XMLHttpRequest.prototype.open = handler
        unsafeWindow.fetch = handler_fetch
    })
}

// this makes the user-script support the [←] Back and [→] Right navigations
// aswell as switching pages because artlist doesn't navigate, but instead
// changes their HTML dynamically so that the end-user does not have to
// reload the entire page.

// by polling the changes in an albeit bad way, we can detect when this
// occurs, and as far as i know there's no other better way to do it.
// please make an issue on github and educate me if there is.

async function Initialize() {
    DontPoll = false

    const Pagetype = GetPagetype()

    if (Pagetype === SONGS_PAGETYPE || Pagetype === SFXS_PAGETYPE) {
        // const Id = location.pathname.split('/')[4]
        // const NumId = new Number(Id)
        // if (NumId.toString() !== 'NaN') {
        //     LoadAssetInfo(NumId)
        // }
        console.log('searching for banner...')

        SongPage = GetSongPage()
        await Until(() => {
            const Data = GetBannerData(SongPage, Pagetype)
            return Data != false && Data.Button != null
        })
        const RowData = GetBannerData(SongPage, Pagetype)
        await Until(() => {
            return GetAudioDataFromRowData(RowData) != null
        })
        const AudioData = GetAudioDataFromRowData(RowData)
        if (RowData.AudioTitle && RowData.Artists.length >= 1) {
            WriteBanner(RowData, AudioData)
        }
    }

    console.log('searching for table...')
    if (Pagetype === SONGS_PAGETYPE || Pagetype == MUSIC_ALBUM_PAGETYPE) {
        await Until(() => {
            return GetTBodyEdgeCase() != undefined
        })
        TBody = GetTBodyEdgeCase()
    } else {
        await Until(() => {
            return GetTBody() != undefined && document.contains(GetTBody())
        })
        TBody = GetTBody()
        console.log('tbody', TBody)
    }

    function OnAudioRowAdded(AudioRow) {
        if (AudioRow.getAttribute('artlist-dl-processed') === 'true') {
            return
        }
        if (AudioRow.classList.contains('hidden')) {
            return
        }
        const RowData = GetAudioRowData(AudioRow, GetPagetype())
        const AudioData = GetAudioDataFromRowData(RowData)

        OnRowAdded(AudioRow, RowData, AudioData)
    }

    console.log('found')
    LastInterval = setInterval(() => {
        if (!TBody) {
            return
        }

        for (const AudioRow of TBody.querySelectorAll(
            '[data-testid=AudioRow], [data-testid=AlbumRow], [data-testid=SongVariantsWrapper]'
        )) {
            if (!AudioRow.hasAttribute('artlist-dl-processed')) {
                try {
                    OnAudioRowAdded(AudioRow)
                    AudioRow.setAttribute('artlist-dl-processed', 'true')
                } catch (e) {
                    console.warn(e)
                }
            }
        }

        for (const modal of document.querySelectorAll('.ReactModal__Content')) {
            for (const AllStemsDownload of modal.querySelectorAll(
                'button[data-testid=renderButton]'
            )) {
                if (
                    !AllStemsDownload.hasAttribute('artlist-dl-processed') &&
                    AllStemsDownload.parentNode.getAttribute('data-testid') ==
                        'download-all-stems-dropdown'
                ) {
                    WriteDownloadAllStems(modal, AllStemsDownload)
                }
            }
            for (const StemContainer of modal.querySelectorAll(
                'span[data-testid=stems-player-stem-name]'
            )) {
                const Stem = StemContainer.parentNode
                if (
                    !Stem.hasAttribute('artlist-dl-processed') &&
                    document.contains(Stem)
                ) {
                    try {
                        OnAudioRowAdded(Stem)
                        Stem.setAttribute('artlist-dl-processed', 'true')
                    } catch (e) {} // will fail on false positives so just hide errors
                }
            }
        }
    }, 500)
}

HookNextRSC()
HookRequests()
document.addEventListener('DOMContentLoaded', () => {
    Initialize()
    setInterval(() => {
        if (TBody != null && !document.contains(TBody)) {
            console.log('Re-updating...')
            DontPoll = true
            TBody = null
            AudioTable = null
            SongPage = null
            Initialize()
        }
    }, 1000)
})
