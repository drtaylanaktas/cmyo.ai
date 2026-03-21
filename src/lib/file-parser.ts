import mammoth from 'mammoth';
import pdf from 'pdf-parse';

export async function parseDocument(fileBuffer: Buffer, fileType: string): Promise<string> {
    try {
        if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            // Parse .docx
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            return result.value.trim();
        } else if (fileType === 'application/pdf') {
            // Parse .pdf
            const data = await pdf(fileBuffer);
            return data.text.trim();
        } else if (fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileType === 'application/vnd.ms-excel') {
            // Parse .xlsx / .xls
            const XLSX = await import('xlsx');
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            let text = '';
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const sheetText = XLSX.utils.sheet_to_csv(sheet);
                if (sheetText) {
                    text += `\n--- SAYFA: ${sheetName} ---\n` + sheetText;
                }
            });
            return text.trim();
        } else {
            throw new Error('Unsupported file type');
        }
    } catch (error) {
        console.error('Error parsing document:', error);
        throw new Error('Failed to parse document content');
    }
}
