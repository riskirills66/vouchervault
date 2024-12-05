# Voucher Vault

## Introduction

VCR Vault is a web application designed for efficient scanning, storing, and managing voucher codes. It features OCR integration, Google Drive connectivity, and a SQL Server database for data management.

---

## Prerequisites

Before starting, ensure you have:

- **Node.js** (v14 or higher)
- **SQL Server** instance
- A **Google Cloud Platform** account
- An **OCR.space** API key

---

## How to Clone and Configure the Project

### Step 1: Clone the Repository

Run the following commands in your terminal:

```bash
git clone https://github.com/riskirills66/vouchervault.git
cd lighthanzle
```

---

### Step 2: Install Dependencies

Install the required dependencies using:

```bash
npm install
```

---

### Step 3: Create `config.json`

In the root directory of the project, create a file named `config.json` and populate it with the following content:

```json
{
    "port": 8040,
    "database": {
        "server": "YOUR_DATABASE_SERVER",
        "database": "YOUR_DATABASE_NAME",
        "user": "YOUR_DATABASE_USER",
        "password": "YOUR_DATABASE_PASSWORD",
        "options": {
            "encrypt": false,
            "trustServerCertificate": false
        }
    },
    "google": {
        "clientId": "YOUR_CLIENT_ID",
        "clientSecret": "YOUR_CLIENT_SECRET",
        "redirectUri": "http://localhost:8040/auth/google/callback"
    },
    "ocr": {
        "apiKeys": [
            "YOUR_API_1_KEY",
            "YOUR_API_2_KEY"
        ]
    },
    "paths": {
        "documents": "captured"
    }
}
```

---

### Step 4: Configure Google Cloud Platform

1. Create a new project in **Google Cloud Platform**.
2. Enable the **Google Drive API** for the project.
3. Create OAuth 2.0 credentials and download the credentials JSON file.
4. Add an authorized redirect URI: `http://localhost:8040/auth/google/callback`.

---

### Step 5: Register for OCR.space API Key

1. Visit [OCR.space](https://ocr.space/ocrapi).
2. Register an account and obtain your free API key(s).
3. Add the API keys to the `config.json` file under the `"ocr"` section.

---

### Step 6: Set Up the Database

Create the required table in your SQL Server instance by running the following SQL command:

```sql
CREATE TABLE fisik (
    kode_produk VARCHAR(20),
    vn VARCHAR(255),
    sn VARCHAR(255),
    status TINYINT,
    tgl_entri DATETIME,
    tgl_kadaluarsa DATETIME,
    keterangan VARCHAR(255)
);
```

---

## How to Start the Application

1. Run the application using:

   ```bash
   node server.js
   ```

2. Open your browser and navigate to:

   ```
   http://localhost:8040
   ```

3. Connect your Google Drive account by clicking the **Connect Google Drive** button.

---

## Usage Instructions

- Use the webcam interface to scan voucher codes.
- Drag the capture area over the desired region of the voucher code.
- Use mouse wheel or +/- buttons to zoom.
- Press **Space** or click **Capture** to scan.
- Use **Escape** to close the preview modal.

---

## Keyboard Shortcuts

- `Space`: Capture image
- `Escape`: Close modal/overlay

---

## Contributing

We welcome contributions! Please fork the repository and open a pull request for any improvements or bug fixes.

---

## License

This project is licensed under the MIT License.
