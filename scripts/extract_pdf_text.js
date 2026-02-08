
const fs = require('fs');
const pdf = require('pdf-parse');

const pdfPath = process.argv[2];

if (!pdfPath) {
    console.error('Usage: node extract_pdf_text.js <pdf_path>');
    process.exit(1);
}

let dataBuffer = fs.readFileSync(pdfPath);

pdf(dataBuffer).then(function (data) {
    // console.log(data.numpages);
    // console.log(data.info);
    console.log(data.text);
}).catch(err => {
    console.error('Error parsing PDF:', err);
    process.exit(1);
});
