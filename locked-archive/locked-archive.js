zip.configure({ useWebWorkers: false });

const dropEl = document.getElementById('drop');
const fileInput = document.getElementById('fileInput');
const filelistEl = document.getElementById('filelist');
const lockBtn = document.getElementById('lockBtn');
const statusEl = document.getElementById('status');
const dlEl = document.getElementById('dl');
const progressTrack = document.getElementById('progressTrack');
const progressFill = document.getElementById('progressFill');

let files = [];

function humanSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function renderList() {
  filelistEl.innerHTML = '';
  files.forEach((f) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="fname">${f.name}</span><span class="fsize">${humanSize(f.size)}</span>`;
    filelistEl.appendChild(li);
  });
  updateButton();
}

function updateButton() {
  const pw = document.getElementById('password').value;
  if (files.length === 0) {
    lockBtn.disabled = true;
    lockBtn.textContent = 'Add files to continue';
  } else if (!pw) {
    lockBtn.disabled = true;
    lockBtn.textContent = 'Set a password to continue';
  } else {
    lockBtn.disabled = false;
    lockBtn.textContent = `Lock ${files.length} file${files.length > 1 ? 's' : ''} into .zip`;
  }
}

dropEl.addEventListener('click', () => fileInput.click());

dropEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropEl.classList.add('drag');
});

dropEl.addEventListener('dragleave', () => dropEl.classList.remove('drag'));

dropEl.addEventListener('drop', (e) => {
  e.preventDefault();
  dropEl.classList.remove('drag');
  files = files.concat(Array.from(e.dataTransfer.files));
  renderList();
});

fileInput.addEventListener('change', () => {
  files = files.concat(Array.from(fileInput.files));
  renderList();
  fileInput.value = '';
});

document.getElementById('password').addEventListener('input', updateButton);

lockBtn.addEventListener('click', async () => {
  statusEl.className = 'status';
  statusEl.textContent = '';
  dlEl.classList.remove('show');

  const pw = document.getElementById('password').value;
  const pw2 = document.getElementById('password2').value;
  const strength = parseInt(document.getElementById('strength').value, 10);
  let archiveName = document.getElementById('archiveName').value.trim() || 'archive.zip';
  if (!archiveName.toLowerCase().endsWith('.zip')) archiveName += '.zip';

  if (pw.length < 4) {
    statusEl.className = 'status err';
    statusEl.textContent = 'Password should be at least 4 characters.';
    return;
  }
  if (pw !== pw2) {
    statusEl.className = 'status err';
    statusEl.textContent = 'Passwords do not match.';
    return;
  }

  lockBtn.disabled = true;
  progressTrack.classList.add('show');
  progressFill.style.width = '0%';
  statusEl.textContent = 'Compressing and encrypting…';

  try {
    const zipWriter = new zip.ZipWriter(new zip.BlobWriter('application/zip'), {
      password: pw,
      encryptionStrength: strength,
      zipCrypto: false
    });

    let done = 0;
    for (const file of files) {
      await zipWriter.add(file.name, new zip.BlobReader(file));
      done++;
      progressFill.style.width = Math.round((done / files.length) * 100) + '%';
    }

    const blob = await zipWriter.close();
    const url = URL.createObjectURL(blob);
    dlEl.href = url;
    dlEl.download = archiveName;
    dlEl.textContent = `Download ${archiveName} (${humanSize(blob.size)})`;
    dlEl.classList.add('show');
    statusEl.textContent = 'Done. The zip is encrypted with your password.';
  } catch (err) {
    statusEl.className = 'status err';
    statusEl.textContent = 'Something went wrong: ' + err.message;
  } finally {
    lockBtn.disabled = false;
    updateButton();
  }
});
