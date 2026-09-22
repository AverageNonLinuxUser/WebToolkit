// File Encryptor — Chunked AES-256-GCM via WebCrypto for low-memory support.
// FENC2 Format: MAGIC(5) | salt(16) | iv_base(12) | nameLen u16 BE | name utf-8 | [chunk1][chunk2]...
// FENC1 Format: Legacy single-pass buffer (supported for decryption).

const MAGIC_FENC1 = new Uint8Array([0x46, 0x45, 0x4e, 0x43, 0x31]); // "FENC1"
const MAGIC_FENC2 = new Uint8Array([0x46, 0x45, 0x4e, 0x43, 0x32]); // "FENC2"
const ITERATIONS = 200000;
const SALT_LEN = 16;
const IV_LEN = 12;
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

const tabEncrypt = document.getElementById('tabEncrypt');
const tabDecrypt = document.getElementById('tabDecrypt');
const paneEncrypt = document.getElementById('paneEncrypt');
const paneDecrypt = document.getElementById('paneDecrypt');

const encDrop = document.getElementById('encDrop');
const encInput = document.getElementById('encFileInput');
const encList = document.getElementById('encFilelist');
const encPw = document.getElementById('encPassword');
const encPw2 = document.getElementById('encPassword2');
const encryptBtn = document.getElementById('encryptBtn');
const encStatus = document.getElementById('encStatus');
const encDl = document.getElementById('encDl');

const decDrop = document.getElementById('decDrop');
const decInput = document.getElementById('decFileInput');
const decList = document.getElementById('decFilelist');
const decPw = document.getElementById('decPassword');
const decryptBtn = document.getElementById('decryptBtn');
const decStatus = document.getElementById('decStatus');
const decDl = document.getElementById('decDl');

let encFile = null;
let decFile = null;

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showStatus(el, msg, isErr) {
  el.className = isErr ? 'status err' : 'status';
  el.textContent = msg;
}

function renderSingle(listEl, file) {
  listEl.innerHTML = '';
  if (!file) return;
  const li = document.createElement('li');
  const name = document.createElement('span');
  name.className = 'fname';
  name.textContent = file.name;
  const size = document.createElement('span');
  size.className = 'fsize';
  size.textContent = humanSize(file.size);
  li.appendChild(name);
  li.appendChild(size);
  listEl.appendChild(li);
}

function updateEncryptBtn() {
  if (!encFile) {
    encryptBtn.disabled = true;
    encryptBtn.textContent = 'Choose a file to continue';
  } else if (!encPw.value) {
    encryptBtn.disabled = true;
    encryptBtn.textContent = 'Set a password to continue';
  } else {
    encryptBtn.disabled = false;
    encryptBtn.textContent = `Encrypt ${encFile.name}`;
  }
}

function updateDecryptBtn() {
  if (!decFile) {
    decryptBtn.disabled = true;
    decryptBtn.textContent = 'Choose a file to continue';
  } else if (!decPw.value) {
    decryptBtn.disabled = true;
    decryptBtn.textContent = 'Enter the password to continue';
  } else {
    decryptBtn.disabled = false;
    decryptBtn.textContent = `Decrypt ${decFile.name}`;
  }
}

tabEncrypt.addEventListener('click', () => {
  tabEncrypt.classList.add('active');
  tabDecrypt.classList.remove('active');
  paneEncrypt.hidden = false;
  paneDecrypt.hidden = true;
});

tabDecrypt.addEventListener('click', () => {
  tabDecrypt.classList.add('active');
  tabEncrypt.classList.remove('active');
  paneDecrypt.hidden = false;
  paneEncrypt.hidden = true;
});

function wireDrop(dropEl, inputEl, onFile) {
  dropEl.addEventListener('click', () => inputEl.click());
  dropEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropEl.classList.add('drag');
  });
  dropEl.addEventListener('dragleave', () => dropEl.classList.remove('drag'));
  dropEl.addEventListener('drop', (e) => {
    e.preventDefault();
    dropEl.classList.remove('drag');
    if (e.dataTransfer.files.length > 0) onFile(e.dataTransfer.files[0]);
  });
  inputEl.addEventListener('change', () => {
    if (inputEl.files.length > 0) onFile(inputEl.files[0]);
    inputEl.value = '';
  });
}

wireDrop(encDrop, encInput, (f) => {
  encFile = f;
  renderSingle(encList, f);
  encDl.classList.remove('show');
  showStatus(encStatus, '', false);
  updateEncryptBtn();
});

wireDrop(decDrop, decInput, (f) => {
  decFile = f;
  renderSingle(decList, f);
  decDl.classList.remove('show');
  showStatus(decStatus, '', false);
  updateDecryptBtn();
});

encPw.addEventListener('input', updateEncryptBtn);
encPw2.addEventListener('input', updateEncryptBtn);
decPw.addEventListener('input', updateDecryptBtn);

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Utility to enforce a UI paint during heavy async loops
const yieldUI = () => new Promise(r => setTimeout(r, 0));

encryptBtn.addEventListener('click', async () => {
  showStatus(encStatus, '', false);
  encDl.classList.remove('show');

  const pw = encPw.value;
  const pw2 = encPw2.value;

  if (!encFile) return;
  if (pw.length < 4) {
    showStatus(encStatus, 'Password should be at least 4 characters.', true);
    return;
  }
  if (pw !== pw2) {
    showStatus(encStatus, 'Passwords do not match.', true);
    return;
  }

  encryptBtn.disabled = true;
  showStatus(encStatus, 'Encrypting…', false);

  try {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const baseIv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const key = await deriveKey(pw, salt);

    const nameBytes = new TextEncoder().encode(encFile.name).slice(0, 1024);
    const header = new Uint8Array(MAGIC_FENC2.length + SALT_LEN + IV_LEN + 2 + nameBytes.length);
    let o = 0;
    header.set(MAGIC_FENC2, o); o += MAGIC_FENC2.length;
    header.set(salt, o); o += SALT_LEN;
    header.set(baseIv, o); o += IV_LEN;
    header[o++] = (nameBytes.length >> 8) & 0xff;
    header[o++] = nameBytes.length & 0xff;
    header.set(nameBytes, o);

    const outChunks = [header];
    let offset = 0;
    let chunkIndex = 0;

    // Process file in memory-friendly 5MB slices
    while (offset < encFile.size) {
      const slice = encFile.slice(offset, offset + CHUNK_SIZE);
      const plainBuf = await slice.arrayBuffer();

      // Deterministically construct IV for each chunk
      const iv = new Uint8Array(baseIv);
      const view = new DataView(iv.buffer);
      const lowBits = view.getUint32(8, false);
      view.setUint32(8, (lowBits + chunkIndex) >>> 0, false);

      const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBuf);
      outChunks.push(cipherBuf);

      offset += CHUNK_SIZE;
      chunkIndex++;

      const percent = Math.min(100, Math.round((offset / encFile.size) * 100));
      showStatus(encStatus, `Encrypting… ${percent}%`, false);
      await yieldUI();
    }

    const blob = new Blob(outChunks, { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    encDl.href = url;
    encDl.download = encFile.name + '.enc';
    encDl.textContent = `Download ${encFile.name}.enc (${humanSize(blob.size)})`;
    encDl.classList.add('show');
    showStatus(encStatus, 'Done. Keep your password safe — it cannot be recovered.', false);
  } catch (err) {
    showStatus(encStatus, 'Something went wrong: ' + err.message, true);
  } finally {
    updateEncryptBtn();
  }
});

decryptBtn.addEventListener('click', async () => {
  showStatus(decStatus, '', false);
  decDl.classList.remove('show');

  if (!decFile) return;
  const pw = decPw.value;
  if (!pw) {
    showStatus(decStatus, 'Enter the password.', true);
    return;
  }

  decryptBtn.disabled = true;
  showStatus(decStatus, 'Decrypting…', false);

  try {
    const magicSlice = decFile.slice(0, 5);
    const magicBuf = new Uint8Array(await magicSlice.arrayBuffer());

    let isFenc1 = true;
    let isFenc2 = true;
    for (let i = 0; i < 5; i++) {
      if (magicBuf[i] !== MAGIC_FENC1[i]) isFenc1 = false;
      if (magicBuf[i] !== MAGIC_FENC2[i]) isFenc2 = false;
    }

    if (!isFenc1 && !isFenc2) throw new Error('Not a valid .enc file.');

    // LEGACY: Non-chunked decryption (FENC1)
    if (isFenc1) {
      const buf = new Uint8Array(await decFile.arrayBuffer());
      let o = MAGIC_FENC1.length;
      const salt = buf.slice(o, o + SALT_LEN); o += SALT_LEN;
      const iv = buf.slice(o, o + IV_LEN); o += IV_LEN;
      const nameLen = (buf[o] << 8) | buf[o + 1]; o += 2;
      if (buf.length < o + nameLen) throw new Error('File is truncated.');
      const origName = new TextDecoder().decode(buf.slice(o, o + nameLen)) || 'decrypted.bin';
      o += nameLen;
      const cipher = buf.slice(o);

      const key = await deriveKey(pw, salt);
      let plain;
      try {
        plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
      } catch {
        throw new Error('Wrong password or damaged file.');
      }

      triggerDownload(plain, origName, decDl, decStatus);
      return; // Exit here for FENC1
    }

    // CHUNKED: Low-memory decryption (FENC2)
    if (isFenc2) {
      const headerMax = 5 + SALT_LEN + IV_LEN + 2 + 1024;
      const headerSlice = decFile.slice(0, headerMax);
      const buf = new Uint8Array(await headerSlice.arrayBuffer());

      let o = 5;
      const salt = buf.slice(o, o + SALT_LEN); o += SALT_LEN;
      const baseIv = buf.slice(o, o + IV_LEN); o += IV_LEN;
      const nameLen = (buf[o] << 8) | buf[o + 1]; o += 2;
      
      if (buf.length < o + nameLen) throw new Error('File header is truncated.');
      const origName = new TextDecoder().decode(buf.slice(o, o + nameLen)) || 'decrypted.bin';
      o += nameLen;

      const headerSize = o;
      const key = await deriveKey(pw, salt);
      const outChunks = [];
      let offset = headerSize;
      let chunkIndex = 0;
      const CIPHER_CHUNK_SIZE = CHUNK_SIZE + 16; // 16 bytes for GCM auth tag

      while (offset < decFile.size) {
        const slice = decFile.slice(offset, offset + CIPHER_CHUNK_SIZE);
        const cipherBuf = await slice.arrayBuffer();

        const iv = new Uint8Array(baseIv);
        const view = new DataView(iv.buffer);
        const lowBits = view.getUint32(8, false);
        view.setUint32(8, (lowBits + chunkIndex) >>> 0, false);

        let plainBuf;
        try {
          plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
        } catch (err) {
          throw new Error(`Wrong password or damaged file (failed near chunk ${chunkIndex}).`);
        }

        outChunks.push(plainBuf);
        offset += CIPHER_CHUNK_SIZE;
        chunkIndex++;

        const percent = Math.min(100, Math.round((offset / decFile.size) * 100));
        showStatus(decStatus, `Decrypting… ${percent}%`, false);
        await yieldUI();
      }

      triggerDownload(outChunks, origName, decDl, decStatus);
    }
  } catch (err) {
    showStatus(decStatus, err.message, true);
  } finally {
    updateDecryptBtn();
  }
});

function triggerDownload(data, name, dlElement, statusElement) {
  const blob = new Blob(Array.isArray(data) ? data : [data]);
  const url = URL.createObjectURL(blob);
  dlElement.href = url;
  dlElement.download = name;
  dlElement.textContent = `Download ${name} (${humanSize(blob.size)})`;
  dlElement.classList.add('show');
  showStatus(statusElement, 'Done.', false);
}

updateEncryptBtn();
updateDecryptBtn();