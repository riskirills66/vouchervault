const express = require('express');
const multer = require('multer');
const path = require('path');
const tesseract = require('tesseract.js');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const app = express();
const { google } = require('googleapis');
const sql = require('mssql');
const Jimp = require('jimp');
const config = require('./config.json');
const crypto = require('crypto');

const port = process.env.PORT || config.port;
const documentsPath = path.join(__dirname, config.paths.documents);

async function ensureDirectoryExists() {
    try {
        await fs.access(documentsPath);
    } catch {
        await fs.mkdir(documentsPath, { recursive: true });
    }
}

ensureDirectoryExists();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(express.static('public'));
app.use('/captured', express.static('captured'));

const charMap = {
    O: "0", o: "0",
    Z: "2", z: "2",
    S: "5", s: "5",
    A: "4", a: "4",
    B: "8", b: "8",
    E: "3", e: "3",
    G: "9", g: "9",
    I: "1", i: "1",
    L: "1", l: "1",
    T: "7", t: "7"
};

function convertToNumbers(text) {
    let cleaned = text.replace(/[^0-9A-Za-z]/g, '');
    let converted = cleaned.split('').map(char => charMap[char] || char).join('');
    converted = converted.replace(/[^0-9]/g, '');
    return converted;
}

function generateRandomFileName() {
    return crypto.randomBytes(32).toString('hex') + '.png';
}

app.post('/api/scan', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'ocrImage', maxCount: 1 }
]), async (req, res) => {
    try {
        if (!req.files || !req.files.image || !req.files.ocrImage) {
            return res.status(400).json({ success: false, error: 'No image provided' });
        }

        const fullImageBuffer = req.files.image[0].buffer;
        const ocrImageBuffer = req.files.ocrImage[0].buffer;
        let parsedResult;

        try {
            // Use the cropped image for OCR
            parsedResult = await Promise.any([
                ocrSpaceOCR(ocrImageBuffer),
                tesseractOCR(ocrImageBuffer)
            ]);

            // Verify that we have a numeric result
            if (!parsedResult || parsedResult.length === 0) {
                throw new Error('No numeric data found in the image');
            }

            // Save the full image with the scanned number as filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${parsedResult}.png`;
            const filepath = path.join(documentsPath, filename);

            // Save the full image
            await fs.writeFile(filepath, fullImageBuffer);

            return res.json({
                success: true,
                serialNumber: parsedResult,
                savedAs: filename
            });

        } catch (err) {
            throw new Error('Failed to extract numeric data from the image');
        }
    } catch (error) {
        console.error('Error processing image:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

async function ocrSpaceOCR(imageBuffer) {
    const apiKeys = config.ocr.apiKeys;
    const base64Data = imageBuffer.toString('base64');

    for (const apiKey of apiKeys) {
        const formData = new URLSearchParams();
        formData.append('base64image', `data:image/png;base64,${base64Data}`);
        formData.append('apikey', apiKey);

        try {
            const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });

            const ocrResult = await ocrResponse.json();

            if (ocrResult.ParsedResults && ocrResult.ParsedResults.length > 0) {
                const text = ocrResult.ParsedResults[0].ParsedText.trim();
                return convertToNumbers(text);
            }
        } catch (error) {
            console.error(`Error using API key ${apiKey}:`, error.message);
        }
    }

    throw new Error('All API keys failed. Unable to retrieve OCR results.');
}

async function tesseractOCR(imageBuffer) {
    const { data: { text } } = await tesseract.recognize(imageBuffer);
    return convertToNumbers(text.trim());
}

app.get('/api/captured-images', async (req, res) => {
    try {
        const files = await fs.readdir(documentsPath);
        const imageFiles = await Promise.all(
            files
                .filter(file => file.toLowerCase().endsWith('.png'))  // Only count PNG files
                .map(async (file) => {
                    const filePath = path.join(documentsPath, file);
                    const stats = await fs.stat(filePath);
                    return { file, mtime: stats.mtime };
                })
        );

        // Sort files by modification time (newest first)
        imageFiles.sort((a, b) => b.mtime - a.mtime);

        res.json({ 
            success: true, 
            images: imageFiles.map(({ file }) => file),
            count: imageFiles.length  // Add count to response
        });
    } catch (error) {
        console.error('Error reading captured images:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/captured-images/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filepath = path.join(documentsPath, filename);
        
        // Check if file exists
        await fs.access(filepath);
        
        // Delete the file
        await fs.unlink(filepath);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/captured-images/:filename/rename', async (req, res) => {
    try {
        const oldFilename = req.params.filename;
        const { newName } = req.body;
        
        // Validate new filename
        if (!newName || newName.includes('/') || newName.includes('\\')) {
            throw new Error('Invalid filename');
        }
        
        const oldPath = path.join(documentsPath, oldFilename);
        const newPath = path.join(documentsPath, newName);
        
        // Check if old file exists
        await fs.access(oldPath);
        
        // Rename the file
        await fs.rename(oldPath, newPath);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Database configuration
const dbConfig = config.database;

// Google OAuth configuration
const oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
);

app.get('/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/userinfo.email'
        ]
    });
    res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
    try {
        const { tokens } = await oauth2Client.getToken(req.query.code);
        await fs.writeFile('tokens.json', JSON.stringify(tokens));
        res.redirect('/?auth=success');
    } catch (error) {
        console.error('OAuth error:', error);
        res.redirect('/?auth=error');
    }
});

// Add this function to create or get the folder ID
async function getOrCreateFolder(drive, folderName) {
    try {
        // Check if folder exists
        const response = await drive.files.list({
            q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id)',
            spaces: 'drive'
        });

        if (response.data.files.length > 0) {
            return response.data.files[0].id;
        }

        // Create folder if it doesn't exist
        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        };

        const folder = await drive.files.create({
            resource: fileMetadata,
            fields: 'id'
        });

        return folder.data.id;
    } catch (error) {
        console.error('Error getting/creating folder:', error);
        throw error;
    }
}

// Add this helper function after getOrCreateFolder function
async function makeFilePublic(drive, fileId) {
    try {
        await drive.permissions.create({
            fileId: fileId,
            requestBody: {
                role: 'reader',
                type: 'anyone'
            }
        });
    } catch (error) {
        console.error('Error making file public:', error);
        throw error;
    }
}

// Add these helper functions at the top level
const processImage = async (imageBuffer) => {
    const image = await Jimp.read(imageBuffer);
    const targetSizeKB = 100;

    // Resize in one step if needed
    if (image.bitmap.height > 720) {
        image.resize(Jimp.AUTO, 720);
    }

    let quality = 100;
    let processedBuffer;

    do {
        processedBuffer = await image.quality(quality).getBufferAsync(Jimp.MIME_JPEG);
        if (processedBuffer.length <= targetSizeKB * 1024) break;
        quality -= 5;
    } while (quality >= 0);

    return processedBuffer;
};

const uploadToDrive = async (drive, folderId, fileName, buffer) => {
    const fileMetadata = {
        name: fileName,
        parents: [folderId]
    };

    const media = {
        mimeType: 'image/jpeg',
        body: require('stream').Readable.from(buffer)
    };

    const driveFile = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink'
    });

    await makeFilePublic(drive, driveFile.data.id);
    return driveFile.data.webViewLink.replace('/view?usp=drivesdk', '');
};

// Add retry utility function
const retry = async (fn, retries = 3, delay = 1000) => {
    let lastError;
    
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (error.message.includes('Duplicate')) {
                throw error; // Don't retry duplicates
            }
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
};

// Modified upload endpoint with retry logic
app.post('/api/upload', async (req, res) => {
    try {
        const { kodeProduk, keterangan, tglKadaluarsa, files } = req.body;
        
        if (!files || files.length !== 1) {
            throw new Error('Each request should contain exactly one file');
        }

        const file = files[0];
        const randomFileName = generateRandomFileName();
        
        // Wrap the entire upload process in retry logic
        const { name, driveLink } = await retry(async () => {
            const [tokens, pool, processedBuffer] = await Promise.all([
                fs.readFile('tokens.json').then(JSON.parse),
                sql.connect(dbConfig),
                processImage(Buffer.from(file.buffer.split(',')[1], 'base64'))
            ]);

            oauth2Client.setCredentials(tokens);
            const drive = google.drive({ version: 'v3', auth: oauth2Client });

            const [duplicateCheck, folderId] = await Promise.all([
                pool.request()
                    .input('vn', sql.VarChar, file.name.replace('.png', ''))
                    .query('SELECT vn FROM fisik WHERE vn = @vn'),
                getOrCreateFolder(drive, 'hanzlenord')
            ]);

            if (duplicateCheck.recordset.length > 0) {
                throw new Error(`Duplicate voucher found: ${file.name}`);
            }

            // Upload to Drive with retry
            const driveLink = await retry(
                () => uploadToDrive(drive, folderId, randomFileName, processedBuffer),
                3,
                2000
            );

            // Insert into database with retry
            await retry(async () => {
                await pool.request()
                    .input('kode_produk', sql.VarChar(20), kodeProduk)
                    .input('vn', sql.VarChar(255), file.name.replace('.png', ''))
                    .input('sn', sql.VarChar(255), driveLink)
                    .input('status', sql.TinyInt, 1)
                    .input('tgl_entri', sql.DateTime, new Date())
                    .input('tgl_kadaluarsa', sql.DateTime, new Date(tglKadaluarsa))
                    .input('keterangan', sql.VarChar(255), keterangan)
                    .query(`
                        INSERT INTO fisik (kode_produk, vn, sn, status, tgl_entri, tgl_kadaluarsa, keterangan)
                        VALUES (@kode_produk, @vn, @sn, @status, @tgl_entri, @tgl_kadaluarsa, @keterangan)
                    `);
            });

            return { name: file.name, driveLink };
        });

        res.json({ 
            success: true, 
            result: {
                name,
                driveLink
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/auth/status', async (req, res) => {
    try {
        const tokensExist = await fs.access('tokens.json')
            .then(() => true)
            .catch(() => false);
        
        res.json({ 
            authenticated: tokensExist 
        });
    } catch (error) {
        res.status(500).json({ 
            authenticated: false, 
            error: error.message 
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});