(function () {
    const RETRY_INTERVAL = 3000;
    const previousFiles = new Map(); // track last sent files

    function arrayBufferToBase64(buffer) {
        console.log('Converting ArrayBuffer to Base64', buffer);
        let binary = '';
        let bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        let b64 = btoa(binary);
        console.log('Converted Base64:', b64.substring(0, 50), '...');
        return b64;
    }

    async function readIDBFS() {
        return new Promise((resolve, reject) => {
            console.log('Opening /idbfs database');
            let request = indexedDB.open('/idbfs');

            request.onsuccess = function (event) {
                let db = event.target.result;
                let storeNames = Array.from(db.objectStoreNames);
                console.log('Object stores found:', storeNames);

                if (storeNames.length === 0) {
                    reject('No object stores yet.');
                    return;
                }

                let allFiles = [];

                storeNames.forEach(storeName => {
                    console.log('Reading store:', storeName);
                    let tx = db.transaction(storeName, 'readonly');
                    let store = tx.objectStore(storeName);

                    let getAllRequest = store.getAll();

                    getAllRequest.onsuccess = function () {
                        console.log(`Retrieved ${getAllRequest.result.length} records from store ${storeName}`);
                        getAllRequest.result.forEach((value, index) => {
                            let buffer = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
                            let base64 = arrayBufferToBase64(buffer);
                            let key = `${storeName}-${index}`;

                            if (previousFiles.get(key) !== base64) {
                                console.log('New or updated file:', key);
                                allFiles.push({ store: storeName, index, data: base64 });
                                previousFiles.set(key, base64);
                            }
                        });

                        console.log('All files ready to send:', allFiles.length);
                        resolve(allFiles);
                    };

                    getAllRequest.onerror = function (e) {
                        console.error('Failed to read store:', storeName, e);
                    };
                });
            };

            request.onerror = function (event) {
                console.error('Failed to open /idbfs:', event);
                reject(event);
            };
        });
    }

    async function sendFilesToParent(files) {
        console.log('Preparing to send files to parent:', files.length);
        if (files.length === 0) {
            console.log('No new files to send');
            return;
        }
        if (window.parent) {
            console.log('Sending files to parent window');
            window.parent.postMessage({ type: 'IDBFS_DATA', files }, '*');
            console.log('Sent incremental IDBFS files to parent via postMessage.', files);
        } else {
            console.warn('No parent window found to postMessage to.');
        }
    }

    async function extractAndSend() {
        try {
            console.log('Extracting IDBFS files...');
            const files = await readIDBFS();
            console.log('Files extracted:', files.length);
            await sendFilesToParent(files);
        } catch (err) {
            console.warn('IDBFS not ready, retrying in 3s...', err);
        } finally {
            console.log(`Scheduling next extraction in ${RETRY_INTERVAL}ms`);
            setTimeout(extractAndSend, RETRY_INTERVAL);
        }
    }

    extractAndSend();
})();