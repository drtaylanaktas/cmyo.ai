// Turkish profanity/slang whitelist — words that contain bad word substrings
const WHITELIST = [
    'malzeme', 'normal', 'toplam', 'amaç', 'amal', 'kamal',
    'planlama', 'planlı', 'anlamak', 'anlamlı', 'analiz',
    'optimal', 'diplomasi', 'diplomat',
    'siklon', 'siklus', 'klasik', 'fizik', 'müzik',
    'pikachu', 'piknik', 'piksel',
    'okullar', 'protokol',
];

export const BAD_WORDS = [
    'küfür',
    'aptal',
    'salak',
    'gerizekalı',
    'şerefsiz',
    'pislik',
    'siktir',
    'amk',
    'aq',
    'oç',
    'piç',
    'yavşak',
    'yosma',
    'dalyarak',
    'sürtük',
    'pezevenk',
    'gavat',
    'ananı',
    'bacını',
    'sik',
    'yarrak'
];

export const checkProfanity = (text: string): boolean => {
    const lowerText = text.toLocaleLowerCase('tr-TR');

    // Check whitelist first — if any whitelist word is present, skip those matches
    const whitelistedText = WHITELIST.reduce((acc, word) => {
        return acc.replace(new RegExp(word, 'gi'), ' '.repeat(word.length));
    }, lowerText);

    // Check for bad words (3+ chars use word boundary, short ones need exact match with spaces)
    return BAD_WORDS.some(word => {
        if (word.length <= 3) {
            // Short words: match with spaces/boundaries/start/end
            const pattern = `(?:^|\\s|[^a-zçğıöşü])${word}(?:$|\\s|[^a-zçğıöşü])`;
            return new RegExp(pattern, 'i').test(whitelistedText);
        }
        // Longer words: substring match on whitelist-filtered text
        return whitelistedText.includes(word);
    });
};
