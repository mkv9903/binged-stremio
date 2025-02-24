const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { promisify } = require('util');
const NodeCache = require('node-cache');
const nameToImdb = require('name-to-imdb');
const getImdbIdAsync = promisify(nameToImdb);
const he = require('he');
require('dotenv').config();
function getPKTTime() { return new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi", year: "2-digit", month: "2-digit", day: "2-digit", hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " PKT"; }
// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const cache = new NodeCache({ stdTTL: 604800, checkperiod: 1800, useClones: false });
const filters = ["Must Watch", "Good", "Satisfactory", "Passable", "Poor", "Skip"];
const recommendationMapping = { "A": "Must Watch", "B": "Good", "H": "Satisfactory", "C": "Passable", "D": "Poor", "F": "Skip" };
const supportedLanguages = [
    "Hindi", "English", "Telugu", "Tamil", "Malayalam", "Kannada", "Abkhazian", "Afar", "Afrikaans", "Akan", "Albanian", "Amharic", "Arabic", "Aragonese", "Armenian", "Assamese", "Avaric", "Avestan", "Aymara", "Azerbaijani", "Bambara", "Bashkir", "Basque", "Belarusian", "Bengali", "Bhojpuri", "Bislama", "Bosnian", "Breton", "Bulgarian", "Burmese", "Cantonese", "Catalan", "Chamorro", "Chechen", "Chichewa", "Chuvash", "Cornish", "Corsican", "Cree", "Croatian", "Czech", "Danish", "Divehi", "Dutch", "Dzongkha", "Esperanto", "Estonian", "Ewe", "Faroese", "Fijian", "Finnish", "French", "Frisian", "Fulah", "Gaelic", "Galician", "Ganda", "Georgian", "German", "Greek", "Guarani", "Gujarati", "Haitian", "Haryanvi", "Hausa", "Hebrew", "Herero", "Hiri Motu", "Hungarian", "Icelandic", "Ido", "Igbo", "Indonesian", "Interlingua", "Interlingue", "Inuktitut", "Inupiaq", "Irish", "Italian", "Japanese", "Javanese", "Kalaallisut", "Kanuri", "Kashmiri", "Kazakh", "Khmer", "Kikuyu", "Kinyarwanda", "Kirghiz", "Komi", "Kongo", "Korean", "Kuanyama", "Kurdish", "Lao", "Latin", "Latvian", "Letzeburgesch", "Limburgish", "Lingala", "Lithuanian", "Luba-Katanga", "Macedonian", "Malagasy", "Malay", "Maltese", "Mandarin", "Manipuri", "Manx", "Maori", "Marathi", "Marshall", "Moldavian", "Mongolian", "Nauru", "Navajo", "Ndebele", "Ndonga", "Nepali", "Northern Sami", "Norwegian", "Norwegian Bokmål", "Norwegian Nynorsk", "Occitan", "Ojibwa", "Oriya", "Oromo", "Ossetian", "Other", "Pali", "Persian", "Polish", "Portuguese", "Punjabi", "Pushto", "Quechua", "Raeto-Romance", "Romanian", "Rundi", "Russian", "Samoan", "Sango", "Sanskrit", "Sardinian", "Serbian", "Serbo-Croatian", "Shona", "Sindhi", "Sinhalese", "Slavic", "Slovak", "Slovenian", "Somali", "Sotho", "Spanish", "Sundanese", "Swahili", "Swati", "Swedish", "Tagalog", "Tahitian", "Tajik", "Tatar", "Thai", "Tibetan", "Tigrinya", "Tonga", "Tsonga", "Tswana", "Turkish", "Turkmen", "Twi", "Uighur", "Ukrainian", "Urdu", "Uzbek", "Venda", "Vietnamese", "Volapük", "Walloon", "Welsh", "Wolof", "Xhosa", "Yi", "Yiddish", "Yoruba", "Zhuang", "Zulu"
];

// Get the special RPDB key from environment variable
const specialRpdbKey = process.env.SPECIAL_RPDB_KEY;

const builder = new addonBuilder({
    id: 'com.binged.latest',
    version: '3.0.0',
    name: 'Binged! OTT Releases Catalog',
    description: 'Provides the latest OTT movies and TV shows catalog available to stream on streaming platforms from Binged.com by Asaddon',
    "behaviorHints": {
        "configurable": true,
        "configurationRequired": false
    },
    config: [
        {
            key: 'rpdbApiKey',
            title: 'RPDB API Key',
            type: 'text',
            required: false
        }
    ],
    catalogs: [
        { "type": "movie", "id": "binged-latest", "name": "Binged - Latest", "extra": [{ "name": "genre", "isRequired": false, "options": supportedLanguages }, { "name": "skip", "isRequired": false }, { "name": "recommendation", "isRequired": false, "options": filters }] },
        { "type": "series", "id": "binged-latest", "name": "Binged - Latest", "extra": [{ "name": "genre", "isRequired": false, "options": supportedLanguages }, { "name": "skip", "isRequired": false }, { "name": "recommendation", "isRequired": false, "options": filters }] }
    ],
    resources: ['catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['binged']
});

// Initial fetch function
async function prefetchData() {
    console.log(`${getPKTTime()} - Starting Initial Global Data Fetch...`);
    try {
        await Promise.all([
            fetchAndCacheGlobalData("movie", true),
            fetchAndCacheGlobalData("series", true)
        ]);
        console.log(`${getPKTTime()} - Initial Global Data Fetch Completed.`);
    } catch (error) {
        console.error(`${getPKTTime()} - Error During Initial Global Data Fetch:`, error.message);
    }
}

// Function to refresh data (fetch only the latest 50 items)
async function refreshCatalogData() {
    try {
        await Promise.all([
            fetchAndCacheGlobalData("movie"),
            fetchAndCacheGlobalData("series")
        ]);
    } catch (error) {
        console.error(`${getPKTTime()} - Error Refreshing Global Catalog Data:`, error.message);
    } finally {
        setTimeout(refreshCatalogData, 60 * 60 * 1000); // 1 hour
    }
}

// Initial fetch (fetch all 500 items)
prefetchData().then(() => {
    setTimeout(refreshCatalogData, 60 * 60 * 1000); // First refresh after 1 hour
});

// Function to fetch data with pagination support
async function fetchBingedData(type, start = 0, length = 50, retries = 3, delay = 5000) {
    const url = 'https://www.binged.com/wp-admin/admin-ajax.php';
    const body = new URLSearchParams({
        'filters[category][]': type === 'movie' ? 'Film' : type === 'series' ? 'TV show' : [],
        'filters[mode]': 'streaming-now',
        'filters[page]': 0,
        action: 'mi_events_load_data',
        mode: 'streaming-now',
        start: start,
        length: length,
        customcatalog: 0
    });

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'x-requested-with': 'XMLHttpRequest',
                    'referer': 'https://www.binged.com/streaming-premiere-dates/'
                },
                body: body,
                // Optional: Set a custom timeout (e.g., 30 seconds)
                signal: AbortSignal.timeout(30000)
            });

            if (!response.ok) throw new Error(`Failed to fetch data: ${response.statusText}`);
            return await response.json();
        } catch (error) {
            if (attempt === retries) {
                console.error(`${getPKTTime()} - Fetch failed after ${retries} attempts for ${type}: ${error.message}`);
                throw error; // Propagate the error after all retries fail
            }
            console.warn(`${getPKTTime()} - Fetch attempt ${attempt} failed for ${type}: ${error.message}. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Convert title to IMDb ID
async function getImdbId(title, type) {
    if (!title?.trim()) return null;
    try {
        let cleanedTitle = he.decode(title)
            .replace(/(:?\s*Season\s*\d+)/i, '')
            .replace(/\s?\(.*?\)$/, '')
            .replace(/#/g, '')
            .trim();

        const imdbId = await getImdbIdAsync({ name: cleanedTitle }).catch(() => null);
        if (imdbId) return imdbId;

        const suggestionUrl = `https://sg.media-imdb.com/suggests/${cleanedTitle.charAt(0).toLowerCase()}/${encodeURIComponent(cleanedTitle)}.json`;
        const response = await fetch(suggestionUrl).catch(() => null);
        if (!response || !response.ok) return null;

        const text = await response.text();
        const jsonpMatch = text.match(/imdb\$.*?\((.*)\)/);
        if (!jsonpMatch || !jsonpMatch[1]) return null;

        const data = JSON.parse(jsonpMatch[1]);
        if (!data.d || !Array.isArray(data.d)) return null;

        // Match based on type
        const result = data.d.find(item => {
            if (type === 'movie') return item.qid === 'movie';
            if (type === 'series') return item.q === 'TV series' || item.q === 'TV mini-series';
            return false; // Fallback for unexpected type
        });
        return result && result.id ? result.id : null;
    } catch (err) {
        console.error(`${getPKTTime()} - Unexpected Error Fetching IMDb ID For "${title}" (type: ${type}): ${err.message}`);
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
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        //console.error(`URL Check Failed for ${url}: ${error.message}`);
        return false;
    }
}

// Decode special characters in titles
function decodeTitle(title) {
    return he.decode(title);
}

// Function to fetch and cache global data
async function fetchAndCacheGlobalData(type, isInitialFetch = false, initialFetchLimit = 500, refreshFetchLimit = 50) {
    const cacheKey = `global-${type}`;
    const specialRpdbCacheKey = specialRpdbKey ? `global-${type}-rpdb-${specialRpdbKey}` : null;

    try {
        const fetchLimit = isInitialFetch ? initialFetchLimit : refreshFetchLimit;
        console.log(`${getPKTTime()} - Fetching ${isInitialFetch ? 'All' : 'Latest'} Data For ${cacheKey}...`);
        const rawData = await fetchBingedData(type, 0, fetchLimit);
        const newMetas = await processRawData(rawData.data, type);

        // Cache regular data
        if (isInitialFetch) {
            await cache.set(cacheKey, newMetas, 604800); // 7 days
            console.log(`${getPKTTime()} - Cached ${newMetas.length} Items For ${cacheKey} With A TTL of 7 Days.`);
        } else {
            const existingData = (await cache.get(cacheKey)) || [];
            const updatedData = mergeNewData(existingData, newMetas);
            
            // Calculate the actual number of new items
            const newItemCount = updatedData.length - existingData.length + existingData.filter(item => 
                !updatedData.some(updated => updated.name.toLowerCase() === item.name.toLowerCase())
            ).length;

            if (JSON.stringify(updatedData) !== JSON.stringify(existingData)) {
                console.log(`${getPKTTime()} - Updating ${cacheKey} with ${newItemCount} new items at the top.`);
                await cache.set(cacheKey, updatedData, 604800);
            } else {
                console.log(`${getPKTTime()} - No New Items Found For ${cacheKey}`);
            }
        }

        // Handle special RPDB key caching (similar adjustment needed here)
        if (specialRpdbKey) {
            const rpdbMetas = await Promise.all(newMetas.map(async (meta) => {
                if (meta.id && /^tt\d+$/.test(meta.id)) {
                    const rpdbPoster = `https://api.ratingposterdb.com/${specialRpdbKey}/imdb/poster-default/${meta.id}.jpg?fallback=true`;
                    const isRpdbPosterValid = await isUrlAvailable(rpdbPoster);
                    return {
                        ...meta,
                        poster: isRpdbPosterValid ? rpdbPoster : meta.poster
                    };
                }
                return meta;
            }));

            if (isInitialFetch) {
                await cache.set(specialRpdbCacheKey, rpdbMetas, 604800); // 7 days
                console.log(`${getPKTTime()} - Cached ${rpdbMetas.length} Items For ${specialRpdbCacheKey} With A TTL of 7 Days.`);
            } else {
                const existingRpdbData = (await cache.get(specialRpdbCacheKey)) || [];
                const updatedRpdbData = mergeNewData(existingRpdbData, rpdbMetas);
                
                // Calculate the actual number of new items for RPDB cache
                const newRpdbItemCount = updatedRpdbData.length - existingRpdbData.length + existingRpdbData.filter(item => 
                    !updatedRpdbData.some(updated => updated.name.toLowerCase() === item.name.toLowerCase())
                ).length;

                if (JSON.stringify(updatedRpdbData) !== JSON.stringify(existingRpdbData)) {
                    console.log(`${getPKTTime()} - Updating ${specialRpdbCacheKey} with ${newRpdbItemCount} new items at the top.`);
                    await cache.set(specialRpdbCacheKey, updatedRpdbData, 604800);
                } else {
                    console.log(`${getPKTTime()} - No New Items Found For ${specialRpdbCacheKey}`);
                }
            }
        }

        return newMetas;
    } catch (error) {
        console.error(`${getPKTTime()} - Error in fetchAndCacheGlobalData for ${cacheKey}:`, error);
        const staleData = await cache.get(cacheKey);
        if (staleData) {
            console.warn(`${getPKTTime()} - Returning stale data for ${cacheKey} due to error.`);
            return staleData;
        }
        throw error;
    }
}

// Helper function to merge new data with existing data
function mergeNewData(existingData, newMetas) {
    const nameToItemMap = new Map();
    const isTTId = (id) => id?.startsWith("tt");

    existingData.forEach((item) => {
        const lowerCaseName = item.name.toLowerCase();
        if (!nameToItemMap.has(lowerCaseName) || (isTTId(item.id) && !isTTId(nameToItemMap.get(lowerCaseName)?.id))) {
            nameToItemMap.set(lowerCaseName, item);
        }
    });

    const newItems = [];
    newMetas.forEach((newItem) => {
        const lowerCaseName = newItem.name.toLowerCase();
        if (!nameToItemMap.has(lowerCaseName)) {
            newItems.push(newItem);
            nameToItemMap.set(lowerCaseName, newItem);
        } else if (isTTId(newItem.id)) {
            const existingItem = nameToItemMap.get(lowerCaseName);
            if (!isTTId(existingItem.id)) {
                console.log(`${getPKTTime()} - Prioritizing item with tt ID: ${newItem.id} over ${existingItem.id}`);
                nameToItemMap.set(lowerCaseName, newItem);
            }
        }
    });

    return [
        ...newItems,
        ...existingData.filter(item => !newItems.some(newItem => newItem.name.toLowerCase() === item.name.toLowerCase()))
    ];
}

// Helper function to process raw data into metas
async function processRawData(rawData, type) {
    const imdbPromises = rawData.map(item => getImdbId(item.title).catch(() => null));
    const imdbResults = await Promise.allSettled(imdbPromises);

    const metadataPromises = imdbResults.map((result, index) =>
        result.status === 'fulfilled' && result.value ? getMetadata(result.value, type).catch(() => null) : null
    );
    const metadataResults = await Promise.allSettled(metadataPromises);

    return Promise.all(
        rawData.map(async (item, index) => {
            const imdbId = imdbResults[index]?.status === 'fulfilled' ? imdbResults[index].value : null;
            const meta = metadataResults[index]?.status === 'fulfilled' ? metadataResults[index].value : null;
            const id = imdbId || `binged:${item.id}`;

            let poster = imdbId ? `https://live.metahub.space/poster/small/${imdbId}/img` : item.image;
            let background = imdbId ? `https://live.metahub.space/background/medium/${imdbId}/img` : item.image;

            const [posterAvailable] = await Promise.all([isUrlAvailable(poster)]);
            if (!posterAvailable) poster = item.image;

            return {
                id,
                type,
                name: decodeTitle(item.title),
                poster,
                posterShape: 'poster',
                background,
                description: meta?.description || `${decodeTitle(item.title)} (${item['release-year']}) - ${item.genre}`,
                recommendation: item.recommendation || "",
                releaseInfo: item['release-year'] ? `${item['release-year']}` : (item['streaming-date'] || "Unknown"),
                genres: meta?.genres || item.genre.split(', '),
                languages: item.languages ? item.languages.split(', ') : [],
                cast: meta?.cast || [],
                director: meta?.director || [],
                writer: meta?.writer || [],
                imdbRating: meta?.imdbRating || null,
                runtime: meta?.runtime || null,
                trailers: meta?.trailers || [],
                links: meta?.links || []
            };
        })
    );
}

// Function to check if RPDB key is valid
async function validateRPDBKey(rpdbKey) {
    try {
        const response = await fetch(`https://api.ratingposterdb.com/${rpdbKey}/isValid`);
        const data = await response.json();
        return data?.valid === true;
    } catch (e) {
        return false;
    }
}

// Define catalog handler
builder.defineCatalogHandler(async (args) => {
    const type = args.type;

    if (type !== 'movie' && type !== 'series') {
        return { metas: [] };
    }

    const config = args.config || {};
    const selectedLanguage = args.extra?.genre;
    const globalCacheKey = `global-${type}`;
    const specialRpdbCacheKey = specialRpdbKey ? `global-${type}-rpdb-${specialRpdbKey}` : null;
    const selectedRecommendation = args.extra?.recommendation;

    // Step 1: Determine which cache to use with logging
    let globalData;
    if (config.rpdbApiKey === specialRpdbKey) {
        globalData = cache.get(specialRpdbCacheKey);
        if (!globalData) {
            try {
                globalData = await fetchAndCacheGlobalData(type);
                cache.set(specialRpdbCacheKey, globalData);
            } catch (error) {
                console.error(`${getPKTTime()} - Failed To Fetch Preprocessed Data: ${error.message}`);
                return { metas: [] };
            }
        }
    } else {
        globalData = cache.get(globalCacheKey);
        if (!globalData) {
            try {
                globalData = await fetchAndCacheGlobalData(type);
                cache.set(globalCacheKey, globalData);
            } catch (error) {
                console.error(`${getPKTTime()} - Failed To Fetch Global Data: ${error.message}`);
                return { metas: [] };
            }
        }
    }

    // Step 2: Validate RPDB API key (for non-special keys only)
    let isRPDBKeyValid = false;
    const rpdbValidationCacheKey = `rpdb-valid-${config.rpdbApiKey}`;
    if (config.rpdbApiKey !== specialRpdbKey) {
        isRPDBKeyValid = cache.get(rpdbValidationCacheKey) ?? await validateRPDBKey(config.rpdbApiKey).catch(err => {
            console.error(`${getPKTTime()} - Failed To Validate RPDB Key: ${err.message}`);
            return false;
        });
        cache.set(rpdbValidationCacheKey, isRPDBKeyValid);
        !isRPDBKeyValid && console.log(`${getPKTTime()} - RPDB API Key Is Invalid`);
    }

    // Step 3: Apply RPDB poster updates (only for non-special keys)
    let metasToReturn = globalData;
    if (config.rpdbApiKey !== specialRpdbKey && isRPDBKeyValid) {
        metasToReturn = globalData.map(meta => {
            if (meta.id && /^tt\d+$/.test(meta.id)) {
                return {
                    ...meta,
                    poster: `https://api.ratingposterdb.com/${config.rpdbApiKey}/imdb/poster-default/${meta.id}.jpg?fallback=true`
                };
            }
            return meta;
        });
    }

    // Step 4: Filter by language (if selected)
    if (selectedLanguage) {
        console.log(`${getPKTTime()} - Filtering Data For Language: ${selectedLanguage}`);
        metasToReturn = metasToReturn.filter(item =>
            Array.isArray(item.languages) && item.languages.includes(selectedLanguage)
        );
    }

    // Step 5: Filter by recommendation (if selected)
    if (selectedRecommendation && filters.includes(selectedRecommendation)) {
        console.log(`${getPKTTime()} - Filtering Data For Recommendation: ${selectedRecommendation}`);
        metasToReturn = metasToReturn.filter(item => {
            const mappedRecommendation = recommendationMapping[item.recommendation];
            return mappedRecommendation === selectedRecommendation;
        });
    }

    return { metas: metasToReturn };
});

serveHTTP(builder.getInterface(), { port: 7000, cacheMaxAge: 3600, staleRevalidate: 3600, staleError: 3600 });