let video;
let isCapturing = false;
let zoomLevel = 1;
const zoomStep = 0.1;
const maxZoom = 3;
const minZoom = 1;
let activeUploads = 0;
let isSidebarPinned = false;

function showModal() {
    const modal = document.getElementById('resultModal');
    modal.style.display = 'block';
}

function hideModal() {
    const modal = document.getElementById('resultModal');
    modal.style.display = 'none';
}

async function initializeCamera() {
    try {
        video = document.getElementById('video');
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 24 }
            },
            audio: false
        });
        video.srcObject = stream;
        await video.play();
    } catch (error) {
        console.error('Error accessing camera:', error);
    }
}

async function captureImage() {
    // Check if any modal or upload overlay is open
    const isAnyModalOpen = document.querySelector('.modal[style*="display: block"]');
    const isUploadOverlayVisible = document.getElementById('uploadOverlay').style.display === 'block';
    if (isAnyModalOpen || isUploadOverlayVisible) return; // Disable capture if a modal or upload overlay is open

    if (isCapturing) return;
    isCapturing = true;

    try {
        // Create canvas for full image save
        const saveCanvas = document.createElement('canvas');
        const saveCtx = saveCanvas.getContext('2d');
        
        // Set canvas size to match original video dimensions
        saveCanvas.width = video.videoWidth;
        saveCanvas.height = video.videoHeight;
        
        // Draw the entire video frame for saving
        saveCtx.drawImage(video, 0, 0, saveCanvas.width, saveCanvas.height);
        
        // Create canvas for OCR (only the rectangle area)
        const ocrCanvas = document.createElement('canvas');
        const ocrCtx = ocrCanvas.getContext('2d');
        
        // Get the capture area element
        const captureArea = document.getElementById('capture-area');
        const rect = captureArea.getBoundingClientRect();
        const videoRect = video.getBoundingClientRect();
        
        // Calculate the actual coordinates relative to the video
        const scaleX = video.videoWidth / videoRect.width;
        const scaleY = video.videoHeight / videoRect.height;
        
        const captureX = (rect.left - videoRect.left) * scaleX;
        const captureY = (rect.top - videoRect.top) * scaleY;
        const captureWidth = rect.width * scaleX;
        const captureHeight = rect.height * scaleY;
        
        // Set OCR canvas size to match capture area
        ocrCanvas.width = captureWidth;
        ocrCanvas.height = captureHeight;
        
        // Draw only the selected portion for OCR
        ocrCtx.drawImage(video, 
            captureX, captureY, captureWidth, captureHeight,
            0, 0, captureWidth, captureHeight
        );
        
        // Convert canvases to blobs
        const saveBlob = await new Promise(resolve => saveCanvas.toBlob(resolve, 'image/png'));
        const ocrBlob = await new Promise(resolve => ocrCanvas.toBlob(resolve, 'image/png'));
        
        // Create FormData and append both images
        const formData = new FormData();
        formData.append('image', saveBlob, 'capture.png'); // Full image for saving
        formData.append('ocrImage', ocrBlob, 'ocr.png');   // Cropped image for OCR

        // Send to server
        const response = await fetch('/api/scan', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        
        if (result.success) {
            // Update the preview image with the cropped OCR portion
            const capturedPreview = document.getElementById('capturedPreview');
            capturedPreview.src = ocrCanvas.toDataURL('image/png');
            
            // Update the number text
            document.getElementById('resultNumber').innerHTML = 
                `Kode Voucher: ${result.serialNumber} <span style="font-size: 2.5rem">${result.serialNumber.length}</span>`;
            
            showModal();
            
            // Add a small delay before reloading thumbnails to ensure the file is saved
            setTimeout(loadThumbnails, 500);
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error capturing image:', error);
        document.getElementById('result').textContent = 
            `Error: ${error.message}`;
    } finally {
        isCapturing = false;
    }
}

function initializeDragAndResize() {
    const captureArea = document.getElementById('capture-area');
    const videoContainer = document.querySelector('.camera-container');
    
    // Create resize handles
    const handles = ['nw', 'ne', 'sw', 'se'];
    handles.forEach(handle => {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = `resize-handle ${handle}`;
        captureArea.appendChild(resizeHandle);
    });

    // Center the capture area initially
    function centerCaptureArea() {
        const containerRect = videoContainer.getBoundingClientRect();
        const x = (containerRect.width - captureArea.offsetWidth) / 2;
        const y = (containerRect.height - captureArea.offsetHeight) / 2;
        captureArea.style.left = `${x}px`;
        captureArea.style.top = `${y}px`;
    }

    // Initialize dragging and resizing
    let isDragging = false;
    let isResizing = false;
    let startX, startY;
    let startWidth, startHeight;
    let startLeft, startTop;
    let currentHandle;

    function handleMouseDown(e) {
        if (e.target.classList.contains('resize-handle')) {
            isResizing = true;
            currentHandle = e.target.classList[1];
            startX = e.clientX;
            startY = e.clientY;
            startWidth = captureArea.offsetWidth;
            startHeight = captureArea.offsetHeight;
            startLeft = captureArea.offsetLeft;
            startTop = captureArea.offsetTop;
        } else if (e.target === captureArea) {
            isDragging = true;
            startX = e.clientX - captureArea.offsetLeft;
            startY = e.clientY - captureArea.offsetTop;
        }
    }

    function handleMouseMove(e) {
        const containerRect = videoContainer.getBoundingClientRect();

        if (isResizing) {
            e.preventDefault();
            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;

            if (currentHandle.includes('e')) {
                newWidth = startWidth + (e.clientX - startX);
            }
            if (currentHandle.includes('s')) {
                newHeight = startHeight + (e.clientY - startY);
            }
            if (currentHandle.includes('w')) {
                newWidth = startWidth - (e.clientX - startX);
                newLeft = startLeft + (e.clientX - startX);
            }
            if (currentHandle.includes('n')) {
                newHeight = startHeight - (e.clientY - startY);
                newTop = startTop + (e.clientY - startY);
            }

            // Allow resizing to almost zero
            const minSize = 5;
            captureArea.style.width = `${Math.max(newWidth, minSize)}px`;
            captureArea.style.height = `${Math.max(newHeight, minSize)}px`;
            captureArea.style.left = `${newLeft}px`;
            captureArea.style.top = `${newTop}px`;
        }
        
        if (isDragging) {
            e.preventDefault();
            const newX = e.clientX - startX;
            const newY = e.clientY - startY;
            
            // Constrain to container bounds
            const maxX = containerRect.width - captureArea.offsetWidth;
            const maxY = containerRect.height - captureArea.offsetHeight;
            
            captureArea.style.left = `${Math.min(Math.max(0, newX), maxX)}px`;
            captureArea.style.top = `${Math.min(Math.max(0, newY), maxY)}px`;
        }
    }

    function handleMouseUp() {
        isDragging = false;
        isResizing = false;
    }

    // Add event listeners
    captureArea.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Center the capture area when the video loads
    video.addEventListener('loadedmetadata', centerCaptureArea);
    
    // Initial centering
    centerCaptureArea();
}

function zoomIn() {
    if (zoomLevel < maxZoom) {
        zoomLevel += zoomStep;
        updateVideoTransform();
    }
}

function zoomOut() {
    if (zoomLevel > minZoom) {
        zoomLevel -= zoomStep;
        updateVideoTransform();
    }
}

function updateVideoTransform() {
    const video = document.getElementById('video');
    video.style.transform = `scale(${zoomLevel})`;
}

// Add event listeners for zoom buttons
document.getElementById('zoom-in').addEventListener('click', zoomIn);
document.getElementById('zoom-out').addEventListener('click', zoomOut);

async function deleteImage(filename) {
    try {
        const response = await fetch(`/api/captured-images/${filename}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            await loadThumbnails();
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error deleting image:', error);
    }
}

function showDeleteModal(filename) {
    const modal = document.getElementById('deleteModal');
    modal.style.display = 'block';
    
    const confirmBtn = document.getElementById('confirmDelete');
    const cancelBtn = document.getElementById('cancelDelete');
    const closeBtn = modal.querySelector('.close-modal');
    
    const handleDelete = async () => {
        await deleteImage(filename);
        hideDeleteModal();
    };
    
    const hideDeleteModal = () => {
        modal.style.display = 'none';
        // Remove event listeners
        confirmBtn.removeEventListener('click', handleDelete);
        cancelBtn.removeEventListener('click', hideDeleteModal);
        closeBtn.removeEventListener('click', hideDeleteModal);
    };
    
    // Add event listeners
    confirmBtn.addEventListener('click', handleDelete);
    cancelBtn.addEventListener('click', hideDeleteModal);
    closeBtn.addEventListener('click', hideDeleteModal);
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            hideDeleteModal();
        }
    });
}

function hideAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.style.display = 'none');
}

function handleModalKeyPress(e) {
    const openModal = document.querySelector('.modal[style*="display: block"]');
    if (!openModal) return;

    if (e.code === 'Escape') {
        e.preventDefault();
        hideAllModals();
    } else if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        const confirmButton = openModal.querySelector('.danger-button');
        if (confirmButton) {
            confirmButton.click();
        } else {
            hideAllModals();
        }
    }
}

function showPreviewModal(imageName) {
    const modal = document.getElementById('previewModal');
    const previewImage = document.getElementById('previewImage');
    const nameInput = document.getElementById('imageNameInput');
    const closeBtn = modal.querySelector('.close-modal');
    
    // Remove .png for display
    const displayName = imageName.replace('.png', '');
    
    previewImage.src = `/captured/${imageName}`;
    nameInput.value = displayName;
    modal.style.display = 'block';
    
    // Add close button functionality
    const closePreviewModal = () => {
        modal.style.display = 'none';
        // Remove event listeners
        closeBtn.removeEventListener('click', closePreviewModal);
        previewImage.removeEventListener('click', closePreviewModal); // Remove click event from image
        modal.removeEventListener('click', handleModalClick);
    };
    
    // Handle clicking on the dark overlay
    const handleModalClick = (event) => {
        if (event.target === modal) { // Check if the click is on the modal (dark overlay)
            closePreviewModal();
        }
    };
    
    closeBtn.addEventListener('click', closePreviewModal);
    modal.addEventListener('click', handleModalClick); // Ensure this is set up correctly
    
    // Handle clicking on the preview image to close the modal
    previewImage.addEventListener('click', closePreviewModal); // Add click event to image
    
    // Handle name editing
    nameInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const newName = nameInput.value.trim() + '.png';
            if (newName && newName !== imageName) {
                try {
                    const response = await fetch(`/api/captured-images/${encodeURIComponent(imageName)}/rename`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ newName }),
                    });
                    
                    const result = await response.json();
                    if (result.success) {
                        await loadThumbnails();
                        hideAllModals();
                    }
                } catch (error) {
                }
            }
        }
    });
}

async function loadThumbnails() {
    try {
        const response = await fetch('/api/captured-images');
        const data = await response.json();
        
        if (data.success) {
            // Update file count
            let fileCountElement = document.querySelector('.file-count');
            if (!fileCountElement) {
                fileCountElement = document.createElement('div');
                fileCountElement.className = 'file-count';
                document.querySelector('.container').appendChild(fileCountElement);
            }
            fileCountElement.textContent = `${data.count} Vcr`;
            
            const thumbnailsGrid = document.getElementById('thumbnails-grid');
            thumbnailsGrid.innerHTML = '';
            
            data.images.forEach(imageName => {
                const thumbnailItem = document.createElement('div');
                thumbnailItem.className = 'thumbnail-item';
                
                const img = document.createElement('img');
                img.src = `/Captured/${imageName}`;
                img.alt = imageName;
                
                // Add error handling for images
                img.onerror = () => {
                    console.error(`Failed to load image: ${imageName}`);
                    img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100%" height="100%" fill="%23ddd"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23666">Error</text></svg>';
                };
                
                const nameDiv = document.createElement('div');
                nameDiv.className = 'thumbnail-name';
                nameDiv.textContent = imageName.replace('.png', '');
                
                // Update delete button with SVG trash icon
                const deleteButton = document.createElement('button');
                deleteButton.className = 'delete-button';
                deleteButton.innerHTML = `
                    <svg viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                `;
                deleteButton.title = 'Delete image';
                deleteButton.onclick = (e) => {
                    e.stopPropagation();
                    showDeleteModal(imageName);
                };
                
                // Make the entire thumbnail item clickable
                thumbnailItem.onclick = () => {
                    showPreviewModal(imageName);
                };
                
                thumbnailItem.appendChild(deleteButton);
                thumbnailItem.appendChild(img);
                thumbnailItem.appendChild(nameDiv);
                thumbnailsGrid.appendChild(thumbnailItem);
            });
        }
    } catch (error) {
        console.error('Error loading thumbnails:', error);
    }
}

async function checkAuthStatus() {
    try {
        const response = await fetch('/auth/status');
        const data = await response.json();
        
        const authButton = document.getElementById('connectGoogle');
        const authStatus = document.getElementById('authStatus');
        const uploadButton = document.getElementById('uploadButton');
        
        if (data.authenticated) {
            authButton.classList.add('connected');
            authStatus.textContent = 'Terhubung ke Google Drive';
            uploadButton.disabled = false;
        } else {
            authButton.classList.remove('connected');
            authStatus.textContent = 'Hubungkan Google Drive';
            uploadButton.disabled = true;
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        uploadButton.disabled = true;
    }
}

function updateUploadProgress(filename, status) {
    const row = document.getElementById(`upload-${filename}`);
    if (row) {
        const statusSpan = row.querySelector('.status');
        statusSpan.className = `status ${status.toLowerCase()}`;
        statusSpan.textContent = status;
    }
}

function showUploadOverlay() {
    const overlay = document.getElementById('uploadOverlay');
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    activeUploads = 0;
}

function hideUploadOverlay() {
    const overlay = document.getElementById('uploadOverlay');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
}

function hasCommonSubstring(name1, name2, length = 8) {
    for (let i = 0; i <= name1.length - length; i++) {
        const substring = name1.substring(i, i + length);
        if (name2.includes(substring)) {
            return true;
        }
    }
    return false;
}

function initializeUploadDisplay(files) {
    const resultDiv = document.getElementById('uploadProgress');
    resultDiv.innerHTML = `
        <div class="upload-grid">
            <div class="upload-column"></div>
            <div class="upload-column"></div>
            <div class="upload-column"></div>
        </div>
    `;
    
    const columns = resultDiv.querySelectorAll('.upload-column');
    const baseNames = files.map(file => file.name.replace('.png', '')); // Get base names
    const similarNames = new Set(); // To track similar names

    // Check for common substrings of length 8
    for (let i = 0; i < baseNames.length; i++) {
        for (let j = i + 1; j < baseNames.length; j++) {
            if (hasCommonSubstring(baseNames[i], baseNames[j])) {
                similarNames.add(baseNames[i]);
                similarNames.add(baseNames[j]);
            }
        }
    }

    files.forEach((file, index) => {
        const baseName = file.name.replace('.png', '');

        const column = columns[index % 3];
        const row = document.createElement('div');
        row.id = `upload-${baseName}`;
        row.className = 'upload-row';
        row.innerHTML = `
            <div class="filename-container">
                <span class="filename">${baseName}</span>
                ${similarNames.has(baseName) ? '<span class="flag">⚠️</span>' : ''}
                <button class="copy-button" title="Copy number">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="M16 1H4C3 1 2 2 2 3v14h2V3h12V1zm3 4H8C7 5 6 6 6 7v14c0 1 1 2 2 2h11c1 0 2-1 2-2V7c0-1-1-2-2-2zm0 16H8V7h11v14z"/>
                    </svg>
                </button>
            </div>
            <span class="status pending">Pending</span>
        `;

        // Add click handler for copy button
        const copyButton = row.querySelector('.copy-button');
        copyButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const textToCopy = baseName;
            navigator.clipboard.writeText(textToCopy);
            
            // Visual feedback
            copyButton.classList.add('copied');
            setTimeout(() => copyButton.classList.remove('copied'), 1000);
        });

        column.appendChild(row);
    });
}

// Update the upload form event listener
document.addEventListener('DOMContentLoaded', () => {
    const uploadForm = document.getElementById('uploadForm');
    const connectGoogle = document.getElementById('connectGoogle');
    
    // Add click handler for Google Drive connection
    connectGoogle.addEventListener('click', () => {
        window.location.href = '/auth/google';
    });

    // Add event listeners for overlay dismissal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideUploadOverlay();
        }
    });

    document.getElementById('uploadOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'uploadOverlay') {
            hideUploadOverlay();
        }
    });

    document.querySelector('.close-overlay').addEventListener('click', () => {
        hideUploadOverlay();
    });
    
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fileInput = document.getElementById('fileInput');
        const files = Array.from(fileInput.files);
        
        if (files.length === 0) {
            alert('Silakan pilih file untuk diinput');
            return;
        }

        initializeUploadDisplay(files);
        showUploadOverlay();
        
        // Convert files to base64 and prepare data
        const preparedFiles = await Promise.all(files.map(async (file) => {
            const filename = file.name.replace('.png', '');
            updateUploadProgress(filename, 'Preparing');
            
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
            
            updateUploadProgress(filename, 'Ready');
            return {
                name: file.name,
                buffer: base64
            };
        }));
        
        const commonData = {
            kodeProduk: document.getElementById('kodeProduk').value,
            keterangan: document.getElementById('keterangan').value,
            tglKadaluarsa: document.getElementById('tglKadaluarsa').value,
        };
        
        try {
            activeUploads = files.length;

            const uploadPromises = preparedFiles.map(async (file) => {
                const filename = file.name.replace('.png', '');
                updateUploadProgress(filename, 'Uploading');
                
                try {
                    const response = await fetch('/api/upload', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            ...commonData,
                            files: [file]
                        })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        updateUploadProgress(filename, 'Success');
                    } else {
                        throw new Error(result.error);
                    }
                } catch (error) {
                    updateUploadProgress(filename, 'Error');
                    console.error(`Error uploading ${filename}:`, error);
                    return { success: false, filename, error };
                } finally {
                    activeUploads--;
                    if (activeUploads === 0) {
                        document.querySelector('.close-overlay').disabled = false;
                    }
                }
            });
            
            // Wait for all uploads to complete
            const results = await Promise.all(uploadPromises);
            
            // Check if all uploads were successful
            const allSuccessful = results.every(result => result.success);
            if (allSuccessful) {
                uploadForm.reset();
            }
            
        } catch (error) {
            console.error('Upload error:', error);
        }
    });
    
    // Check initial auth status
    checkAuthStatus();
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeCamera();
    initializeDragAndResize();
    
    document.getElementById('captureButton').addEventListener('click', captureImage);
    
    // Add keyboard event listener at document level
    document.addEventListener('keydown', (e) => {
        const isAnyModalOpen = document.querySelector('.modal[style*="display: block"]');
        const uploadOverlay = document.getElementById('uploadOverlay');
        const sidebar = document.getElementById('uploadSidebar');
        const dragButton = document.getElementById('dragButton');

        // Check if the sidebar is visible
        const isSidebarVisible = sidebar.style.right === '0px';

        if (isAnyModalOpen) {
            handleModalKeyPress(e);
        } else if (e.code === 'Space') {
            e.preventDefault();
            captureImage();
        } else if (e.code === 'Escape' && !isAnyModalOpen && uploadOverlay.style.display !== 'block') {
            // Only hide sidebar with Escape if it's not pinned
            if (isSidebarVisible && !isSidebarPinned) {
                sidebar.style.right = '-300px'; // Hide the sidebar
                dragButton.style.right = '0'; // Position drag button outside when sidebar is hidden
            }
        }
    });
    
    loadThumbnails();
    
    // Add modal close functionality
    const closeModal = document.querySelector('.close-modal');
    const modal = document.getElementById('resultModal');
    
    closeModal.addEventListener('click', hideModal);
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            hideModal();
        }
    });
});

document.getElementById('dragButton').addEventListener('click', () => {
    const sidebar = document.getElementById('uploadSidebar');
    const dragButton = document.getElementById('dragButton');
    const isVisible = sidebar.style.right === '0px';

    // Toggle sidebar visibility only if it's not pinned
    if (!isSidebarPinned) {
        sidebar.style.right = isVisible ? '-300px' : '0px'; // Show or hide the sidebar

        // Adjust drag button position
        if (isVisible) {
            dragButton.style.right = '0'; // Position drag button outside when sidebar is hidden
        } else {
            dragButton.style.right = '300px'; // Position drag button at the edge of the sidebar when visible
        }
    }
});

// Modify the click event listener to respect the pin state
document.addEventListener('click', (event) => {
    const sidebar = document.getElementById('uploadSidebar');
    const dragButton = document.getElementById('dragButton');

    if (!isSidebarPinned) {  // Only hide if not pinned
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnDragButton = dragButton.contains(event.target);
        const isClickOnMainContainer = document.querySelector('.container').contains(event.target);
        const isClickOnThumbnails = document.querySelector('.thumbnails-section').contains(event.target);
        const isClickOnVideoContainer = document.querySelector('.camera-container').contains(event.target);

        if (!isClickInsideSidebar && !isClickOnDragButton && (isClickOnMainContainer || isClickOnThumbnails || isClickOnVideoContainer)) {
            sidebar.style.right = '-300px'; // Hide the sidebar
            dragButton.style.right = '0'; // Position drag button outside when sidebar is hidden
        }
    }
});

// Add event listener for the new button
document.getElementById('showUploadProgress').addEventListener('click', () => {
    showUploadOverlay(); // Call the function to show the upload overlay
});

// Disable focusing except on input fields
document.addEventListener('focusin', (event) => {
    if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
        event.preventDefault();
        event.target.blur();
    }
});

// Disable right-clicking
document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

document.getElementById('pinSidebar').addEventListener('click', function() {
    this.classList.toggle('pinned');
    isSidebarPinned = this.classList.contains('pinned');
});
  