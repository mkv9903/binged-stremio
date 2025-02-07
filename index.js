const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { promisify } = require('util');
const NodeCache = require('node-cache');
const nameToImdb = require('name-to-imdb');
const getImdbIdAsync = promisify(nameToImdb);
const he = require('he');
// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
// Cache setup (TTL: 24 hours)
const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600, useClones: false, });

const supportedLanguages = [
    "Hindi", "Telugu", "Tamil", "Malayalam", "Kannada", "Abkhazian", "Afar", "Afrikaans", "Akan", "Albanian", "Amharic", "Arabic", "Aragonese", "Armenian", "Assamese", "Avaric", "Avestan", "Aymara", "Azerbaijani", "Bambara", "Bashkir", "Basque", "Belarusian", "Bengali", "Bhojpuri", "Bislama", "Bosnian", "Breton", "Bulgarian", "Burmese", "Cantonese", "Catalan", "Chamorro", "Chechen", "Chichewa", "Chuvash", "Cornish", "Corsican", "Cree", "Croatian", "Czech", "Danish", "Divehi", "Dutch", "Dzongkha", "English", "Esperanto", "Estonian", "Ewe", "Faroese", "Fijian", "Finnish", "French", "Frisian", "Fulah", "Gaelic", "Galician", "Ganda", "Georgian", "German", "Greek", "Guarani", "Gujarati", "Haitian", "Haryanvi", "Hausa", "Hebrew", "Herero", "Hiri Motu", "Hungarian", "Icelandic", "Ido", "Igbo", "Indonesian", "Interlingua", "Interlingue", "Inuktitut", "Inupiaq", "Irish", "Italian", "Japanese", "Javanese", "Kalaallisut", "Kanuri", "Kashmiri", "Kazakh", "Khmer", "Kikuyu", "Kinyarwanda", "Kirghiz", "Komi", "Kongo", "Korean", "Kuanyama", "Kurdish", "Lao", "Latin", "Latvian", "Letzeburgesch", "Limburgish", "Lingala", "Lithuanian", "Luba-Katanga", "Macedonian", "Malagasy", "Malay", "Maltese", "Mandarin", "Manipuri", "Manx", "Maori", "Marathi", "Marshall", "Moldavian", "Mongolian", "Nauru", "Navajo", "Ndebele", "Ndonga", "Nepali", "Northern Sami", "Norwegian", "Norwegian Bokmål", "Norwegian Nynorsk", "Occitan", "Ojibwa", "Oriya", "Oromo", "Ossetian", "Other", "Pali", "Persian", "Polish", "Portuguese", "Punjabi", "Pushto", "Quechua", "Raeto-Romance", "Romanian", "Rundi", "Russian", "Samoan", "Sango", "Sanskrit", "Sardinian", "Serbian", "Serbo-Croatian", "Shona", "Sindhi", "Sinhalese", "Slavic", "Slovak", "Slovenian", "Somali", "Sotho", "Spanish", "Sundanese", "Swahili", "Swati", "Swedish", "Tagalog", "Tahitian", "Tajik", "Tatar", "Thai", "Tibetan", "Tigrinya", "Tonga", "Tsonga", "Tswana", "Turkish", "Turkmen", "Twi", "Uighur", "Ukrainian", "Urdu", "Uzbek", "Venda", "Vietnamese", "Volapük", "Walloon", "Welsh", "Wolof", "Xhosa", "Yi", "Yiddish", "Yoruba", "Zhuang", "Zulu"
];
// Render Refresh Start
const renderUrl = 'https://binged-stremio.onrender.com';
const interval = 10 * 60 * 1000; // 10 minutes in milliseconds
const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Karachi', timeZoneName: 'long' };

setInterval(() => {
  const date = new Date();
  fetch(renderUrl)
    .then(res => console.info(`Reloaded at ${date.toLocaleString('en-US', options)}: Status ${res.ok ? res.status : 'Error'}`))
    .catch(err => console.error(`Error at ${date.toLocaleString('en-US', options)}: (${err.message})`));
}, interval);
// Render Refresh End

const builder = new addonBuilder({
    id: 'com.binged.latest',
    version: '1.0.0',
    name: 'Latest OTT Releases Catalog for Movies and TV Shows',
    description: 'Provides the latest movies and TV shows from Binged.com by Asaddon',
    catalogs: [
        { id: 'binged-latest', type: 'movie', name: 'Binged - Latest', extra: [{ name: 'language', isRequired: false, options: supportedLanguages }] },
        { id: 'binged-latest', type: 'series', name: 'Binged - Latest', extra: [{ name: 'language', isRequired: false, options: supportedLanguages }] }
    ],
    resources: ['catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['binged']
});

// Fetch data from Binged
async function fetchBingedData(type) {
    const url = 'https://www.binged.com/wp-admin/admin-ajax.php';
    const body = new URLSearchParams({
        'filters[category][]': type === 'movie' ? 'Film' : 'Tv show',
        'filters[mode]': 'streaming-now',
        'filters[page]': 0,
        action: 'mi_events_load_data',
        mode: 'streaming-now',
        start: 0,
        length: 500,
        customcatalog: 0
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'accept': '*/*',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'x-requested-with': 'XMLHttpRequest',
            'referer': 'https://www.binged.com/streaming-premiere-dates/'
        },
        body: body
    });

    if (!response.ok) throw new Error(`Failed to fetch data: ${response.statusText}`);

    const data = await response.json();
    return data.data;
}

// Convert title to IMDb ID
async function getImdbId(title) {
    if (!title?.trim()) return null;
    try {
        return await getImdbIdAsync({ name: title.replace(/\s?\(.*?\)$/, '').replace(/#/g, '').trim() }).catch(() => null);
    } catch {
        return null;
    }
}

// Fetch metadata from Cinemeta
async function getMetadata(imdbId, type) {
    if (!imdbId?.startsWith('tt')) return null;
    try {
        const response = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`);
        return response.ok ? (await response.json()).meta : null;
    } catch {
        return null;
    }
}

// Check if an image URL is valid
async function isUrlAvailable(url) {
    try {
        return (await fetch(url, { method: 'HEAD' })).ok;
    } catch {
        return false;
    }
}

// Decode special characters in titles
function decodeTitle(title) {
    return he.decode(title);
}

// Helper function to format the release date
function formatReleaseDate(releaseDate) {
    if (!releaseDate) return null;

    const date = new Date(releaseDate);
    if (isNaN(date)) return null;  // If it's an invalid date

    // Format the date to 'DD MMM YYYY' (e.g., '07 Feb 2025')
    const options = { year: 'numeric', month: 'short', day: '2-digit' };
    return date.toLocaleDateString('en-GB', options);
}

// Fetch and cache global data
async function fetchAndCacheGlobalData(type) {
    const cacheKey = `global-${type}`;
    console.log(`Fetching fresh global data for: ${type}`);

    try {
        const rawData = await fetchBingedData(type);

        const imdbPromises = rawData.map(item => getImdbId(item.title).catch(() => null));
        const imdbResults = await Promise.allSettled(imdbPromises);

        const metadataPromises = imdbResults.map((result, index) =>
            result.status === 'fulfilled' && result.value ? getMetadata(result.value, type).catch(() => null) : null
        );
        const metadataResults = await Promise.allSettled(metadataPromises);

        const metas = await Promise.all(
            rawData.map(async (item, index) => {
                const imdbId = imdbResults[index]?.status === 'fulfilled' ? imdbResults[index].value : null;
                const meta = metadataResults[index]?.status === 'fulfilled' ? metadataResults[index].value : null;
                const id = imdbId || `binged:${item.id}`;

                let poster = imdbId ? `https://live.metahub.space/poster/small/${imdbId}/img` : item['big-image'];
                let background = imdbId ? `https://live.metahub.space/background/medium/${imdbId}/img` : item['big-image'];

                const [posterAvailable, backgroundAvailable] = await Promise.all([isUrlAvailable(poster), isUrlAvailable(background)]);
                if (!posterAvailable) poster = item['big-image'];
                if (!backgroundAvailable) background = item['big-image'];

                return {
                    id, type, name: decodeTitle(item.title),
                    poster, posterShape: 'poster', background,
                    description: meta?.description || `${item.title} (${item['release-year']}) - ${item.genre}`,
                    releaseInfo: formatReleaseDate(item['releaseInfo']) || item['streaming-date'],  // Format releaseInfo here
                    genres: meta?.genres || item.genre.split(', '),
                    languages: item.languages ? item.languages.split(', ') : [],
                    cast: meta?.cast || [], director: meta?.director || [], writer: meta?.writer || [],
                    imdbRating: meta?.imdbRating || null, runtime: meta?.runtime || null,
                    trailers: meta?.trailers || [], links: meta?.links || []
                };
            })
        );

        cache.set(cacheKey, metas);
        console.log(`Cached global data for: ${type}`);
        return metas;
    } catch (error) {
        console.error(`Error fetching data for ${type}:`, error);
        return [];
    }
}

// Function to prefetch data at startup
async function prefetchData() {
    console.log("Starting initial global data fetch...");
    await fetchAndCacheGlobalData("movie");
    await fetchAndCacheGlobalData("series");
    console.log("Initial global data fetch completed.");
}

// Set an interval to refresh cache every 24 hours
setInterval(() => {
    console.log("Refreshing global catalog data...");
    fetchAndCacheGlobalData("movie");
    fetchAndCacheGlobalData("series");
}, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

// Define catalog handler
builder.defineCatalogHandler(async (args) => {
    const type = args.type;
    const selectedLanguage = args.extra?.language;
    const globalCacheKey = `global-${type}`;
    const languageCacheKey = selectedLanguage ? `${type}-${selectedLanguage}` : globalCacheKey;

    if (cache.has(languageCacheKey)) {
        console.log(`Serving cached data for: ${languageCacheKey}`);
        return { metas: cache.get(languageCacheKey) };
    }

    const globalData = cache.get(globalCacheKey) || [];

    if (!selectedLanguage) {
        return { metas: globalData };
    }

    const filteredData = globalData.filter(item => item.languages.includes(selectedLanguage));
    cache.set(languageCacheKey, filteredData);
    console.log(`Cached filtered data for: ${languageCacheKey}`);

    return { metas: filteredData };
});

// Start prefetching immediately on startup
prefetchData();

serveHTTP(builder.getInterface(), { port: 7000 });
