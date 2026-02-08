export const BAD_WORDS = [
    'küfür',
    'aptal',
    'salak',
    'gerizekalı',
    'mal',
    'şerefsiz',
    'pislik',
    'lan',
    'nah',
    'siktir',
    'amk',
    'aq',
    'oç',
    'piç',
    'yavşak',
    'dangalak',
    'eşşek',
    'it',
    'köpek',
    'hıyar',
    'haysiyetsiz',
    'adilik',
    'kaltak',
    'yosma',
    'ahmak',
    'angut',
    'davar',
    'dalyarak',
    'sürtük',
    'pezevenk',
    'gavat'
];

export const checkProfanity = (text: string): boolean => {
    const lowerText = text.toLocaleLowerCase('tr-TR');
    return BAD_WORDS.some(word => lowerText.includes(word));
};
