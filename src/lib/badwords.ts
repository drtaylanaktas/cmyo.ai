export const BAD_WORDS = [
    'küfür',
    'aptal',
    'salak',
    'gerizekalı',
    'mal',
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
    // Use regex to look for full words only, preventing "plan" triggering "lan"
    return BAD_WORDS.some(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        return regex.test(lowerText);
    });
};
