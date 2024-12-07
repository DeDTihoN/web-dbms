// Global state
let currentTable = null;
let editingRowId = null;
let modals = {};
let currentPath = '';
let isSaveMode = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeModals();
    loadTables();

    // Add file browser modal
    const fileBrowserModal = document.getElementById('fileBrowserModal');
    if (fileBrowserModal) {
        modals.fileBrowser = new bootstrap.Modal(fileBrowserModal);
    }
});

// Initialize Bootstrap modals
function initializeModals() {
    // Initialize each modal only if the element exists
    const modalElements = {
        createTable: document.getElementById('createTableModal'),
        addRow: document.getElementById('addRowModal'),
        editRow: document.getElementById('editRowModal'),
        addColumn: document.getElementById('addColumnModal')
    };

    // Initialize only existing modals
    Object.entries(modalElements).forEach(([key, element]) => {
        if (element) {
            modals[key] = new bootstrap.Modal(element);
        }
    });
}

// API functions
async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };
        if (data !== null) {
            options.body = typeof data === 'string' ? `"${data}"` : JSON.stringify(data);
        }
        const response = await fetch(endpoint, options);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'API call failed');
        }
        return await response.json();
    } catch (error) {
        showToast(error.message, 'error');
        throw error;
    }
}

// Table management
async function loadTables() {
    try {
        const data = await apiCall('/api/tables');
        const tableList = document.getElementById('tableList');
        tableList.innerHTML = '';

        data.tables.forEach(tableName => {
            const item = document.createElement('a');
            item.href = '#';
            item.className = 'list-group-item list-group-item-action';
            item.textContent = tableName;
            item.onclick = () => loadTable(tableName);
            tableList.appendChild(item);
        });
    } catch (error) {
        console.error('Failed to load tables:', error);
    }
}

async function loadTable(tableName) {
    try {
        const data = await apiCall(`/api/tables/${tableName}`);
        currentTable = data;

        document.getElementById('currentTableName').textContent = tableName;
        document.getElementById('tableActions').style.display = 'block';

        // Set up table headers
        const thead = document.querySelector('#dataTable thead');
        thead.innerHTML = '<tr>' +
            data.schema.map(field =>
                `<th>
                    ${field.name} [${field.type}${field.enum_values ? ': ' + field.enum_values.join(', ') : ''}]
                    ${!field.auto_increment ?
                    `<button class="btn btn-sm btn-danger ms-2" onclick="deleteColumn('${field.name}')">
                            <i class="bi bi-trash"></i>
                        </button>`
                    : ''}
                </th>`
            ).join('') +
            '<th>Actions</th></tr>';

        // Set up table body
        const tbody = document.querySelector('#dataTable tbody');
        tbody.innerHTML = data.rows.map((row, index) =>
            '<tr>' +
            data.schema.map(field =>
                `<td>${row[field.name] ?? ''}</td>`
            ).join('') +
            `<td>
                <button class="btn btn-sm btn-primary me-1" onclick="showEditRowModal(${index})">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteRow(${index})">
                    <i class="bi bi-trash"></i>
                </button>
            </td></tr>`
        ).join('');
    } catch (error) {
        console.error('Failed to load table:', error);
    }
}

// Table operations
function showCreateTableModal() {
    if (modals.createTable) {
        document.getElementById('newTableName').value = '';
        document.getElementById('newTableSchema').value = '';
        modals.createTable.show();
    } else {
        showToast('Modal initialization failed', 'error');
    }
}

async function createTable() {
    const name = document.getElementById('newTableName').value.trim();
    const schemaText = document.getElementById('newTableSchema').value;

    if (!name) {
        showToast('Table name is required', 'error');
        return;
    }

    try {
        const schema = schemaText.trim() ? schemaText.split('\n')
            .filter(line => line.trim())
            .map(line => {
                const parts = line.split(':');
                if (parts.length < 2) {
                    throw new Error(`Invalid schema format: ${line}`);
                }
                const name = parts[0].trim();
                const type = parts[1].trim();
                const enumValues = parts.length > 2 ? parts[2].split(',').map(v => v.trim()) : undefined;

                return {
                    name: name,
                    type: type,
                    enum_values: enumValues
                };
            }) : [];  // Empty array if no schema provided

        await apiCall('/api/tables', 'POST', { name, schema });
        if (modals.createTable) {
            modals.createTable.hide();
        }
        await loadTables();
        showToast('Table created successfully', 'success');
    } catch (error) {
        console.error('Failed to create table:', error);
        showToast(error.message, 'error');
    }
}

async function deleteTable() {
    if (!currentTable) return;

    if (!confirm(`Are you sure you want to delete table "${currentTable.name}"?`)) {
        return;
    }

    try {
        await apiCall(`/api/tables/${currentTable.name}`, 'DELETE');
        currentTable = null;
        document.getElementById('currentTableName').textContent = '';
        document.getElementById('tableActions').style.display = 'none';
        document.querySelector('#dataTable thead').innerHTML = '';
        document.querySelector('#dataTable tbody').innerHTML = '';
        await loadTables();
        showToast('Table deleted successfully', 'success');
    } catch (error) {
        console.error('Failed to delete table:', error);
    }
}

// Row operations
function showAddRowModal() {
    if (!currentTable) return;

    const form = document.getElementById('addRowForm');
    form.innerHTML = currentTable.schema
        .filter(field => !field.auto_increment)
        .map(field => `
            <div class="mb-3">
                <label class="form-label">${field.name} [${field.type}]</label>
                ${getInputHtml(field, `row_${field.name}`)}
            </div>
        `).join('');

    if (modals.addRow) {
        modals.addRow.show();
    }
}

async function addRow() {
    if (!currentTable) return;

    try {
        const rowData = {};
        currentTable.schema
            .filter(field => !field.auto_increment)
            .forEach(field => {
                const value = document.getElementById(`row_${field.name}`).value;
                rowData[field.name] = convertValue(value, field.type);
            });

        await apiCall(`/api/tables/${currentTable.name}/rows`, 'POST', rowData);
        if (modals.addRow) {
            modals.addRow.hide();
        }
        await loadTable(currentTable.name);
        showToast('Row added successfully', 'success');
    } catch (error) {
        console.error('Failed to add row:', error);
        showToast(error.message, 'error');
    }
}

function showEditRowModal(rowId) {
    if (!currentTable) return;

    editingRowId = rowId;
    const row = currentTable.rows[rowId];

    const form = document.getElementById('editRowForm');
    form.innerHTML = currentTable.schema
        .filter(field => !field.auto_increment)
        .map(field => `
            <div class="mb-3">
                <label class="form-label">${field.name}</label>
                ${getInputHtml(field, `edit_${field.name}`, row[field.name])}
            </div>
        `).join('');

    if (modals.editRow) {
        modals.editRow.show();
    }
}

async function saveEditRow() {
    if (!currentTable || editingRowId === null) return;

    try {
        const rowData = {};
        currentTable.schema
            .filter(field => !field.auto_increment)
            .forEach(field => {
                const value = document.getElementById(`edit_${field.name}`).value;
                rowData[field.name] = convertValue(value, field.type);
            });

        await apiCall(
            `/api/tables/${currentTable.name}/rows/${editingRowId}`,
            'PUT',
            rowData
        );
        if (modals.editRow) {
            modals.editRow.hide();
        }
        await loadTable(currentTable.name);
        showToast('Row updated successfully', 'success');
    } catch (error) {
        console.error('Failed to update row:', error);
        showToast(error.message, 'error');
    }
}

async function deleteRow(rowId) {
    if (!currentTable) return;

    if (!confirm('Are you sure you want to delete this row?')) {
        return;
    }

    try {
        await apiCall(`/api/tables/${currentTable.name}/rows/${rowId}`, 'DELETE');
        await loadTable(currentTable.name);
        showToast('Row deleted successfully', 'success');
    } catch (error) {
        console.error('Failed to delete row:', error);
    }
}

// Column operations
function showAddColumnModal() {
    if (!currentTable) return;
    document.getElementById('newColumnName').value = '';
    document.getElementById('newColumnType').value = 'string';
    document.getElementById('enumValues').value = '';
    document.getElementById('enumValuesDiv').style.display = 'none';
    if (modals.addColumn) {
        modals.addColumn.show();
    }
}

function toggleEnumValues() {
    const type = document.getElementById('newColumnType').value;
    document.getElementById('enumValuesDiv').style.display =
        type === 'enum' ? 'block' : 'none';
}

async function addColumn() {
    if (!currentTable) return;

    const name = document.getElementById('newColumnName').value.trim();
    const type = document.getElementById('newColumnType').value;
    const enumValues = type === 'enum'
        ? document.getElementById('enumValues').value.split(',').map(v => v.trim())
        : undefined;

    if (!name) {
        showToast('Column name is required', 'error');
        return;
    }

    try {
        await apiCall(`/api/tables/${currentTable.name}/columns`, 'POST', {
            name,
            type,
            enum_values: enumValues
        });
        if (modals.addColumn) {
            modals.addColumn.hide();
        }
        await loadTable(currentTable.name);
        showToast('Column added successfully', 'success');
    } catch (error) {
        console.error('Failed to add column:', error);
        showToast(error.message, 'error');
    }
}

async function deleteColumn(columnName) {
    if (!currentTable) return;

    if (!confirm(`Are you sure you want to delete column "${columnName}"?`)) {
        return;
    }

    try {
        await apiCall(
            `/api/tables/${currentTable.name}/columns/${columnName}`,
            'DELETE'
        );
        await loadTable(currentTable.name);
        showToast('Column deleted successfully', 'success');
    } catch (error) {
        console.error('Failed to delete column:', error);
        showToast(error.message, 'error');
    }
}

// Database operations
function showSaveDbModal() {
    isSaveMode = true;
    document.getElementById('fileBrowserTitle').textContent = 'Choose Directory to Save';
    document.getElementById('saveControls').style.display = 'block';
    document.getElementById('saveFilename').value = '';
    if (modals.fileBrowser) {
        modals.fileBrowser.show();
        navigateTo('');
    }
}

async function saveInCurrentDirectory() {
    const filename = document.getElementById('saveFilename').value.trim();
    if (!filename) {
        showToast('Please enter a filename', 'error');
        return;
    }

    try {
        await apiCall('/api/save', 'POST', {
            path: currentPath || '.',
            filename: filename
        });
        if (modals.fileBrowser) {
            modals.fileBrowser.hide();
        }
        showToast('Database saved successfully', 'success');
    } catch (error) {
        console.error('Failed to save database:', error);
        showToast(error.message, 'error');
    }
}

// Load database
function showLoadDbModal() {
    isSaveMode = false;
    document.getElementById('fileBrowserTitle').textContent = 'Choose Database File to Load';
    document.getElementById('saveControls').style.display = 'none';
    if (modals.fileBrowser) {
        modals.fileBrowser.show();
        navigateTo('');
    }
}

async function loadDatabaseFile(filepath) {
    try {
        console.log('Loading file:', filepath);  // Debug log

        const response = await fetch('/api/load', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(filepath)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.detail || 'Failed to load database');
        }

        if (modals.fileBrowser) {
            modals.fileBrowser.hide();
        }

        // Reset UI
        currentTable = null;
        document.getElementById('currentTableName').textContent = '';
        document.getElementById('tableActions').style.display = 'none';
        document.querySelector('#dataTable thead').innerHTML = '';
        document.querySelector('#dataTable tbody').innerHTML = '';

        // Reload tables
        await loadTables();
        showToast('Database loaded successfully', 'success');
    } catch (error) {
        console.error('Failed to load database:', error);
        showToast(error.message || 'Failed to load database', 'error');
    }
}

// Directory navigation
async function navigateTo(path) {
    try {
        console.log('Navigating to:', path);  // Debug log
        currentPath = path;
        const response = await apiCall(`/api/directories?current_path=${encodeURIComponent(path)}`);

        // Update breadcrumb
        const breadcrumb = document.getElementById('pathBreadcrumb');
        const pathParts = path.split(/[/\\]/);  // Split on both forward and back slashes
        breadcrumb.innerHTML = '<li class="breadcrumb-item"><a href="#" onclick="navigateTo(\'\')">Root</a></li>';
        let currentPathPart = '';
        pathParts.forEach((part, index) => {
            if (part) {
                currentPathPart += (currentPathPart ? '\\' : '') + part;
                breadcrumb.innerHTML += `
                    <li class="breadcrumb-item">
                        <a href="#" onclick="navigateTo('${currentPathPart.replace(/\\/g, '\\\\')}')">${part}</a>
                    </li>`;
            }
        });

        // Update file list
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = response.items.map(item => `
            <a href="#" class="list-group-item list-group-item-action" onclick="${item.type === 'directory'
                ? `navigateTo('${item.path.replace(/\\/g, '\\\\')}')`
                : isSaveMode
                    ? ''
                    : `loadDatabaseFile('${item.path.replace(/\\/g, '\\\\')}')`
            }">
                <i class="bi bi-${item.type === 'directory' ? 'folder' : 'file-earmark-text'} me-2"></i>
                ${item.name}
            </a>
        `).join('');

        // Show/hide save controls
        document.getElementById('saveControls').style.display = isSaveMode ? 'block' : 'none';
    } catch (error) {
        console.error('Failed to navigate:', error);
        showToast(error.message, 'error');
    }
}

// Utility functions
function getInputHtml(field, id, value = '') {
    if (field.type === 'enum') {
        return `
            <select class="form-select" id="${id}">
                ${field.enum_values.map(v =>
            `<option value="${v}" ${v === value ? 'selected' : ''}>${v}</option>`
        ).join('')}
            </select>`;
    } else {
        return `<input type="${getInputType(field.type)}" 
                       class="form-control" 
                       id="${id}" 
                       value="${value}">`;
    }
}

function getInputType(fieldType) {
    switch (fieldType) {
        case 'integer':
        case 'real':
            return 'number';
        case 'email':
            return 'email';
        default:
            return 'text';
    }
}

function convertValue(value, type) {
    switch (type) {
        case 'integer':
            return parseInt(value);
        case 'real':
            return parseFloat(value);
        default:
            return value;
    }
}

function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : 'success'}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');

    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;

    toastContainer.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();

    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

// Add search functionality
async function searchTable() {
    if (!currentTable) return;

    const searchText = document.getElementById('searchInput').value.trim();
    if (!searchText) {
        await loadTable(currentTable.name);  // Reset to show all rows
        return;
    }

    try {
        const data = await apiCall(`/api/tables/${currentTable.name}/search?pattern=${encodeURIComponent(searchText)}`);

        // Update table with search results
        const tbody = document.querySelector('#dataTable tbody');
        tbody.innerHTML = data.rows.map((row, index) =>
            '<tr>' +
            currentTable.schema.map(field =>
                `<td>${row[field.name] ?? ''}</td>`
            ).join('') +
            `<td>
                <button class="btn btn-sm btn-primary me-1" onclick="showEditRowModal(${index})">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteRow(${index})">
                    <i class="bi bi-trash"></i>
                </button>
            </td></tr>`
        ).join('');
    } catch (error) {
        console.error('Failed to search:', error);
        showToast(error.message, 'error');
    }
}

// Add event listener for Enter key in search input
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchTable();
        }
    });
});
