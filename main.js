// main.js - ACTUALIZADO PARA USAR better-sqlite3
require('dotenv').config();

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
// ¡CAMBIO! Usamos better-sqlite3 en lugar de sqlite3
const Database = require('better-sqlite3');
const ActiveDirectory = require('activedirectory2');

let db;

// --- ¡IMPORTANTE! CONFIGURACIÓN DEL DIRECTORIO ACTIVO ---
let sessionAdUsername = null;
let sessionAdPassword = null;

const adConfig = {
    /*
    url: process.env.AD_URL,
    baseDN: process.env.AD_BASEDN,
    username: process.env.AD_USERNAME,
    password: process.env.AD_PASSWORD
    */
    url: process.env.AD_URL,
    baseDN: process.env.AD_BASEDN
};
/*
const adConfig = {
    url: 'ldap://192.168.1.10', // Mantén la IP que probaste o vuelve a 'ldap://consenso.local'
    baseDN: 'dc=consenso,dc=local'
};*/
// --- Función para Inicializar y Migrar la Base de Datos ---
function initializeDatabase() {
    const dbPath = path.join(app.getPath('userData'), 'actas.db');
    db = new Database(dbPath, { verbose: console.log });
    console.log('Conectado a la base de datos SQLite con better-sqlite3.');

    // Crear tablas si no existen
    db.exec(`
        CREATE TABLE IF NOT EXISTS actas (
            id INTEGER PRIMARY KEY AUTOINCREMENT, acta_n TEXT UNIQUE, fecha TEXT, tipo_acta TEXT, tecnico_responsable TEXT, usuario TEXT, nombre TEXT, cedula TEXT, ciudad TEXT, ubicacion TEXT, empresa TEXT, departamento TEXT, correo TEXT, zona TEXT, hostname TEXT, jefatura TEXT, ticket TEXT, observaciones TEXT, firmar_jefatura INTEGER, jefatura_nombre TEXT, jefatura_cedula TEXT, fotos TEXT
        )
    `);
    db.exec(`
        CREATE TABLE IF NOT EXISTS equipos (
            id INTEGER PRIMARY KEY AUTOINCREMENT, acta_id INTEGER, tipo TEXT, marca TEXT, desc TEXT, mtm TEXT, serie TEXT, estado TEXT, codigo TEXT, dano INTEGER, faltante INTEGER, FOREIGN KEY (acta_id) REFERENCES actas (id) ON DELETE CASCADE
        )
    `);

    // --- LÓGICA DE MIGRACIÓN PARA AÑADIR COLUMNAS ---
    try {
        const columnsInfo = db.prepare("PRAGMA table_info(actas)").all();
        const columnNames = columnsInfo.map(col => col.name);

        // Añadir columna 'status' si no existe
        if (!columnNames.includes('status')) {
            db.exec("ALTER TABLE actas ADD COLUMN status TEXT DEFAULT 'DRAFT'");
            console.log("Columna 'status' añadida a la tabla 'actas'.");
        }
        // Añadir columna 'dashboard_data' si no existe
        if (!columnNames.includes('dashboard_data')) {
            db.exec("ALTER TABLE actas ADD COLUMN dashboard_data TEXT");
            console.log("Columna 'dashboard_data' añadida a la tabla 'actas'.");
        }
        // Añadir columna 'pdf_path' si no existe
        if (!columnNames.includes('pdf_path')) {
            db.exec("ALTER TABLE actas ADD COLUMN pdf_path TEXT");
            console.log("Columna 'pdf_path' añadida a la tabla 'actas'.");
        }
    } catch (err) {
        console.error('Error durante la migración de la base de datos:', err.message);
    }

    console.log("La base de datos está lista y actualizada.");
}


// --- Función para Crear la Ventana de la Aplicación ---
function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280, height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, nodeIntegration: false,
        }
    });
    mainWindow.loadFile('index.html');
    mainWindow.removeMenu();
    // mainWindow.webContents.openDevTools();
}

// --- Registro de Manejadores de IPC ---
function registerIpcHandlers() {
    ipcMain.handle('get-image-base64', (event, filename) => {
        try {
            const imagePath = path.join(__dirname, filename); // Une la ruta del proyecto con el nombre del archivo
            if (fs.existsSync(imagePath)) {
                const buffer = fs.readFileSync(imagePath);
                return `data:image/png;base64,${buffer.toString('base64')}`;
            }
            return null; // Devuelve null si no se encuentra
        } catch (error) {
            console.error(`Error al cargar la imagen ${filename}:`, error);
            return null;
        }
               
    });

    ipcMain.handle('set-ad-credentials', (event, { username, password }) => {
        console.log(`Credenciales de AD establecidas para la sesión del usuario: ${username}`);
        sessionAdUsername = username;
        sessionAdPassword = password;
        return { success: true };
    });

    // NUEVA FUNCIÓN: Intenta la búsqueda con autenticación integrada de Windows (SSO)
    /*
    ipcMain.handle('search-ad', (event, searchTerm) => {
        return new Promise((resolve) => {
            // Configuración SIN credenciales para usar SSPI (Windows Auth)
            const sspiConfig = {
                url: 'ldap://consenso.local',
                //url: 'ldap://192.168.1.10',
                baseDN: 'dc=consenso,dc=local',
            };

            try {
                const ad = new ActiveDirectory(sspiConfig);
                const query = `(|(sAMAccountName=${searchTerm})(description=${searchTerm}))`;
                
                ad.find(query, (err, results) => {
                    if (err || !results || !results.users || results.users.length === 0) {
                        // Si falla, es probable que no estemos en la red.
                        // Le decimos al frontend que necesita pedir credenciales.
                        console.log('Búsqueda SSO fallida, solicitando credenciales.');
                        if (err) {
                            console.error('--- ERROR DETALLADO DE CONEXIÓN AD ---'); // <-- LÍNEA AÑADIDA
                            console.error(err);                                   // <-- LÍNEA AÑADIDA
                            console.error('------------------------------------'); // <-- LÍNEA AÑADIDA
                        }
                        return resolve({ success: false, reason: 'NEEDS_CREDENTIALS' });
                    }
                    // ¡Éxito! Encontramos al usuario automáticamente.
                    console.log('Búsqueda SSO exitosa.');
                    resolve({ success: true, user: results.users[0] });
                });
            } catch (error) {
                console.error('Error al intentar búsqueda SSO:', error);
                resolve({ success: false, reason: 'NEEDS_CREDENTIALS' });
            }
        });
    });
    
    ipcMain.handle('search-ad-real', (event, {searchTerm}) => {
        return new Promise((resolve) => {
            try {
                const ad = new ActiveDirectory(adConfig);
                //const query = `(|(sAMAccountName=${searchTerm})(description=${searchTerm}))`;
                //const query = `(|(sAMAccountName=${searchTerm})(description=${searchTerm})(cn=*${searchTerm}*))`;
                const query = `(|(sAMAccountName=${searchTerm})(description=${searchTerm})(cn=*${searchTerm}*)(employeeID=${searchTerm}))`;
                
                ad.find(query, (err, results) => {
                    if (err) {
                        console.error('ERROR en la búsqueda de AD:', err);
                        return resolve({ success: false, message: 'Error de conexión con el Directorio Activo. Revisa la configuración en main.js y la conexión de red.' });
                    }
                    if (!results || !results.users || results.users.length === 0) {
                        return resolve({ success: false, message: 'Usuario no encontrado en el Directorio Activo.' });
                    }
                    resolve({ success: true, user: results.users[0] });
                });
            } catch (error) {
                console.error('Error al inicializar ActiveDirectory:', error);
                resolve({ success: false, message: 'Error en la configuración de Directorio Activo. Revisa las credenciales en main.js.' });
            }
        });
    });
    */
 /*  
    ipcMain.handle('search-ad-real', (event, { searchTerm, techUsername, techPassword }) => {
        return new Promise((resolve) => {
            // Crea una configuración temporal para esta búsqueda específica
            const searchConfig = {
                url: adConfig.url,
                baseDN: adConfig.baseDN,
                username: techUsername, // <-- Usa el usuario del formulario
                password: techPassword  // <-- Usa la contraseña del formulario
            };

            try {
                const ad = new ActiveDirectory(searchConfig);
                const query = `(|(sAMAccountName=${searchTerm})(description=${searchTerm})(cn=*${searchTerm}*)(employeeID=${searchTerm}))`;

                ad.find(query, (err, results) => {
                    if (err) {
                        console.error('ERROR en la búsqueda de AD:', err);
                        // Devuelve un error más específico si las credenciales son malas
                        if (err.name === 'InvalidCredentialsError') {
                            return resolve({ success: false, message: 'Credenciales de técnico incorrectas.' });
                        }
                        return resolve({ success: false, message: 'Error de conexión con el Directorio Activo.' });
                    }
                    if (!results || !results.users || !results.users.length === 0) {
                        return resolve({ success: false, message: 'Usuario no encontrado en el Directorio Activo.' });
                    }
                    resolve({ success: true, user: results.users[0] });
                });
            } catch (error) {
                console.error('Error al inicializar ActiveDirectory:', error);
                resolve({ success: false, message: 'Error en la configuración de Directorio Activo.' });
            }
        });
    });
*/
    // --- Busca en AD, usando las credenciales guardadas si existen ---
// --- Busca en AD, usando las credenciales guardadas si existen ---
    ipcMain.handle('search-ad-real', (event, { searchTerm }) => {
        return new Promise((resolve) => {
            // 1. Verifica si ya tenemos credenciales guardadas en la sesión.
            if (!sessionAdUsername || !sessionAdPassword) {
                console.log('No hay credenciales en sesión. Solicitando al frontend.');
                // Si no las tenemos, le decimos al frontend que las pida.
                return resolve({ success: false, reason: 'NEEDS_CREDENTIALS' });
            }

            // 2. Si las tenemos, las usamos para la búsqueda.
            console.log(`Usando credenciales de sesión para buscar: ${searchTerm}`);
            const searchConfig = {
                url: adConfig.url,
                baseDN: adConfig.baseDN,
                username: sessionAdUsername,
                password: sessionAdPassword
            };

            try {
                const ad = new ActiveDirectory(searchConfig);
                const query = `(|(sAMAccountName=${searchTerm})(description=${searchTerm})(cn=*${searchTerm}*)(employeeID=${searchTerm}))`;

                ad.find(query, (err, results) => {
//==================================================================================
/*
                    if (err) {
                        console.error('ERROR en la búsqueda de AD:', err);
                        // Si las credenciales guardadas son incorrectas, las borramos para que las pida de nuevo.
                        if (err.name === 'InvalidCredentialsError') {
                            sessionAdUsername = null;
                            sessionAdPassword = null;
                            return resolve({ success: false, reason: 'NEEDS_CREDENTIALS', message: 'Las credenciales guardadas son incorrectas. Por favor, ingrésalas de nuevo.' });
                        }
                        return resolve({ success: false, message: 'Error de conexión con el Directorio Activo.' });
                    }
*/
//==================================================================================
                    if (err) {
                        console.error('ERROR en la búsqueda de AD:', err);
                        // Verificamos si el error es por credenciales inválidas
                        if (err.name === 'InvalidCredentialsError' || (err.lde_message && err.lde_message.includes('data 52e'))) {
                            // Si lo es, borramos las credenciales malas de la sesión
                            sessionAdUsername = null;
                            sessionAdPassword = null;
                            // Y enviamos una razón específica: 'INVALID_CREDENTIALS'
                            return resolve({ success: false, reason: 'INVALID_CREDENTIALS' });
                        }
                        // Para cualquier otro error, devolvemos un mensaje genérico
                        return resolve({ success: false, message: 'Error de conexión con el Directorio Activo.' });
                    }
                    if (!results || !results.users || !results.users.length === 0) {
                        return resolve({ success: false, message: 'Usuario no encontrado en el Directorio Activo.' });
                    }
                    // ¡Éxito! Devolvemos el usuario.
                    resolve({ success: true, user: results.users[0] });
                });
            } catch (error) {
                console.error('Error al inicializar ActiveDirectory:', error);
                resolve({ success: false, message: 'Error en la configuración de Directorio Activo.' });
            }
        });
    });
// -------------------------------------------------------------------------
//-------------------------------------------------------
    ipcMain.handle('save-draft', async (event, { acta, equipos }) => {
        try {
            const row = db.prepare("SELECT id FROM actas WHERE acta_n = ?").get(acta.acta_n);
            
            const saveTransaction = db.transaction((actaData, equiposData, existingRow) => {
                if (existingRow) {
                    // Actualizar borrador
                    const actaId = existingRow.id;
                    const updateActaStmt = db.prepare(`
                        UPDATE actas SET 
                        fecha = ?, tipo_acta = ?, tecnico_responsable = ?, usuario = ?, nombre = ?, cedula = ?, ciudad = ?,
                        ubicacion = ?, empresa = ?, departamento = ?, correo = ?, zona = ?, hostname = ?, jefatura = ?, ticket = ?,
                        observaciones = ?, firmar_jefatura = ?, jefatura_nombre = ?, jefatura_cedula = ?, fotos = ?, status = 'DRAFT'
                        WHERE id = ?
                    `);
                    updateActaStmt.run(actaData.fecha, actaData.tipo_acta, actaData.tecnico_responsable, actaData.usuario, actaData.nombre, actaData.cedula, actaData.ciudad, actaData.ubicacion, actaData.empresa, actaData.departamento, actaData.correo, actaData.zona, actaData.hostname, actaData.jefatura, actaData.ticket, actaData.observaciones, actaData.firmar_jefatura ? 1 : 0, actaData.jefatura_nombre, actaData.jefatura_cedula, JSON.stringify(actaData.fotos), actaId);
                    
                    db.prepare("DELETE FROM equipos WHERE acta_id = ?").run(actaId);
                    const equipoStmt = db.prepare(`INSERT INTO equipos (acta_id, tipo, marca, desc, mtm, serie, estado, codigo, dano, faltante) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                    equiposData.forEach(eq => equipoStmt.run(actaId, eq.tipo, eq.marca, eq.desc, eq.mtm, eq.serie, eq.estado, eq.codigo, eq.dano ? 1 : 0, eq.faltante ? 1 : 0));
                } else {
                    // Insertar nuevo borrador
                    const insertActaStmt = db.prepare(`INSERT INTO actas (acta_n, fecha, tipo_acta, tecnico_responsable, usuario, nombre, cedula, ciudad, ubicacion, empresa, departamento, correo, zona, hostname, jefatura, ticket, observaciones, firmar_jefatura, jefatura_nombre, jefatura_cedula, fotos, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')`);
                    const info = insertActaStmt.run(actaData.acta_n, actaData.fecha, actaData.tipo_acta, actaData.tecnico_responsable, actaData.usuario, actaData.nombre, actaData.cedula, actaData.ciudad, actaData.ubicacion, actaData.empresa, actaData.departamento, actaData.correo, actaData.zona, actaData.hostname, actaData.jefatura, actaData.ticket, actaData.observaciones, actaData.firmar_jefatura ? 1 : 0, actaData.jefatura_nombre, actaData.jefatura_cedula, JSON.stringify(actaData.fotos));
                    
                    const actaId = info.lastInsertRowid;
                    const equipoStmt = db.prepare(`INSERT INTO equipos (acta_id, tipo, marca, desc, mtm, serie, estado, codigo, dano, faltante) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                    equiposData.forEach(eq => equipoStmt.run(actaId, eq.tipo, eq.marca, eq.desc, eq.mtm, eq.serie, eq.estado, eq.codigo, eq.dano ? 1 : 0, eq.faltante ? 1 : 0));
                }
            });

            saveTransaction(acta, equipos, row);
            return { success: true };
        } catch (err) {
            console.error('Error guardando borrador:', err);
            return { success: false, message: err.message };
        }
    });

    ipcMain.handle('load-draft', (event, acta_n) => {
        try {
            const actaRow = db.prepare("SELECT * FROM actas WHERE acta_n = ?").get(acta_n);
            if (!actaRow) return { success: false, message: "Borrador no encontrado" };
            
            const equiposRows = db.prepare("SELECT * FROM equipos WHERE acta_id = ?").all(actaRow.id);
            actaRow.fotos = JSON.parse(actaRow.fotos || '[]');
            return { success: true, acta: actaRow, equipos: equiposRows };
        } catch (err) {
            console.error('Error cargando borrador:', err);
            return { success: false, message: err.message };
        }
    });

    // === FUNCIÓN MODIFICADA PARA ACEPTAR BÚSQUEDA ===
    ipcMain.handle('get-drafts', async (event, searchTerm) => {
        try {
            // Se devuelve fecha para usarla en el nuevo dashboard
            let query = "SELECT acta_n, nombre, fecha FROM actas WHERE status = 'DRAFT'";
            const params = [];

            if (searchTerm && searchTerm.trim() !== '') {
                query += " AND (acta_n LIKE ? OR nombre LIKE ?)";
                params.push(`%${searchTerm}%`, `%${searchTerm}%`);
            }

            query += " ORDER BY id DESC";
            
            return db.prepare(query).all(...params);
        } catch (err) {
            console.error('Error al obtener borradores:', err.message);
            return [];
        }
    });


    ipcMain.handle('delete-draft', async (event, acta_n) => {
        try {
            db.prepare("DELETE FROM actas WHERE acta_n = ? AND status = 'DRAFT'").run(acta_n);
            return { success: true };
        } catch (err) {
            return { success: false, message: err.message };
        }
    });

    // AÑADE ESTE CÓDIGO NUEVO AQUÍ
ipcMain.handle('get-finalized-actas', async (event, searchTerm) => {
    try {
        let query = "SELECT acta_n, tipo_acta, nombre, fecha, pdf_path FROM actas WHERE status = 'FINALIZED'";
        const params = [];
        if (searchTerm && searchTerm.trim() !== '') {
            query += " AND (acta_n LIKE ? OR nombre LIKE ?)";
            params.push(`%${searchTerm}%`, `%${searchTerm}%`);
        }
        query += " ORDER BY id DESC";
        return db.prepare(query).all(...params);
    } catch (err) {
        console.error('Error al obtener actas finalizadas:', err.message);
        return [];
    }
});

ipcMain.handle('open-pdf-externally', async (event, filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            await shell.openPath(filePath);
            return { success: true };
        } else {
            return { success: false, message: 'El archivo PDF no se encontró en la ruta guardada. Puede haber sido movido o eliminado.' };
        }
    } catch (error) {
        console.error(`Error al abrir el PDF: ${error.message}`);
        return { success: false, message: error.message };
    }
});

    // CON ESTE BLOQUE NUEVO
    /*
ipcMain.handle('add-to-dashboard', (event, { acta, equipos, dashboardRow, pdfPath }) => {
    // La transacción ahora se hace dentro de un bloque try...catch para mejor manejo de errores
    try {
        const dashboardTransaction = db.transaction(() => {
            // La consulta ahora incluye 'status' y 'pdf_path'
            const upsertStmt = db.prepare(`
                INSERT INTO actas (acta_n, fecha, tipo_acta, tecnico_responsable, usuario, nombre, cedula, ciudad, ubicacion, empresa, departamento, correo, zona, hostname, jefatura, ticket, observaciones, firmar_jefatura, jefatura_nombre, jefatura_cedula, fotos, status, dashboard_data, pdf_path)
                VALUES (@acta_n, @fecha, @tipo_acta, @tecnico_responsable, @usuario, @nombre, @cedula, @ciudad, @ubicacion, @empresa, @departamento, @correo, @zona, @hostname, @jefatura, @ticket, @observaciones, @firmar_jefatura, @jefatura_nombre, @jefatura_cedula, @fotos, 'FINALIZED', @dashboard_data, @pdf_path)
                ON CONFLICT(acta_n) DO UPDATE SET
                    fecha=excluded.fecha, tipo_acta=excluded.tipo_acta, tecnico_responsable=excluded.tecnico_responsable, usuario=excluded.usuario, nombre=excluded.nombre, cedula=excluded.cedula, ciudad=excluded.ciudad,
                    ubicacion=excluded.ubicacion, empresa=excluded.empresa, departamento=excluded.departamento, correo=excluded.correo, zona=excluded.zona, hostname=excluded.hostname, jefatura=excluded.jefatura, ticket=excluded.ticket,
                    observaciones=excluded.observaciones, firmar_jefatura=excluded.firmar_jefatura, jefatura_nombre=excluded.jefatura_nombre, jefatura_cedula=excluded.jefatura_cedula, fotos=excluded.fotos,
                    status='FINALIZED', dashboard_data=excluded.dashboard_data, pdf_path=excluded.pdf_path
            `);

            // Ejecutamos la consulta con todos los datos, incluyendo pdfPath
            upsertStmt.run({

                ...acta,
                firmar_jefatura: acta.firmar_jefatura ? 1 : 0,
                fotos: JSON.stringify(acta.fotos),
                //dashboard_data: JSON.stringify(dashboardRow),
                dashboard_data: JSON.stringify(dashboardRows),
                pdf_path: pdfPath // <-- ¡Importante! Guardamos la ruta del PDF
            });

            const finalRow = db.prepare("SELECT id FROM actas WHERE acta_n = ?").get(acta.acta_n);
            if (!finalRow) throw new Error("No se pudo obtener el ID del acta final.");

            const actaId = finalRow.id;
            db.prepare("DELETE FROM equipos WHERE acta_id = ?").run(actaId);
            const equipoStmt = db.prepare(`INSERT INTO equipos (acta_id, tipo, marca, desc, mtm, serie, estado, codigo, dano, faltante) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            equipos.forEach(eq => equipoStmt.run(actaId, eq.tipo, eq.marca, eq.desc, eq.mtm, eq.serie, eq.estado, eq.codigo, eq.dano ? 1 : 0, eq.faltante ? 1 : 0));
        });

        dashboardTransaction();
        return { success: true };
    } catch (err) {
        console.error('Error al añadir al dashboard:', err);
        return { success: false, message: err.message };
    }
});
*/
// REEMPLAZA TU FUNCIÓN 'add-to-dashboard' CON ESTA VERSIÓN CORREGIDA

ipcMain.handle('add-to-dashboard', (event, { acta, equipos, dashboardRows, pdfPath }) => { // <-- CORRECCIÓN #1: Aquí ahora es "dashboardRows"
    try {
        const dashboardTransaction = db.transaction(() => {
            const upsertStmt = db.prepare(`
                INSERT INTO actas (acta_n, fecha, tipo_acta, tecnico_responsable, usuario, nombre, cedula, ciudad, ubicacion, empresa, departamento, correo, zona, hostname, jefatura, ticket, observaciones, firmar_jefatura, jefatura_nombre, jefatura_cedula, fotos, status, dashboard_data, pdf_path)
                VALUES (@acta_n, @fecha, @tipo_acta, @tecnico_responsable, @usuario, @nombre, @cedula, @ciudad, @ubicacion, @empresa, @departamento, @correo, @zona, @hostname, @jefatura, @ticket, @observaciones, @firmar_jefatura, @jefatura_nombre, @jefatura_cedula, @fotos, 'FINALIZED', @dashboard_data, @pdf_path)
                ON CONFLICT(acta_n) DO UPDATE SET
                    fecha=excluded.fecha, tipo_acta=excluded.tipo_acta, tecnico_responsable=excluded.tecnico_responsable, usuario=excluded.usuario, nombre=excluded.nombre, cedula=excluded.cedula, ciudad=excluded.ciudad,
                    ubicacion=excluded.ubicacion, empresa=excluded.empresa, departamento=excluded.departamento, correo=excluded.correo, zona=excluded.zona, hostname=excluded.hostname, jefatura=excluded.jefatura, ticket=excluded.ticket,
                    observaciones=excluded.observaciones, firmar_jefatura=excluded.firmar_jefatura, jefatura_nombre=excluded.jefatura_nombre, jefatura_cedula=excluded.jefatura_cedula, fotos=excluded.fotos,
                    status='FINALIZED', dashboard_data=excluded.dashboard_data, pdf_path=excluded.pdf_path
            `);
            
            upsertStmt.run({
                ...acta,
                firmar_jefatura: acta.firmar_jefatura ? 1 : 0,
                fotos: JSON.stringify(acta.fotos),
                dashboard_data: JSON.stringify(dashboardRows), // <-- CORRECCIÓN #2: Aquí también es "dashboardRows"
                pdf_path: pdfPath
            });

            const finalRow = db.prepare("SELECT id FROM actas WHERE acta_n = ?").get(acta.acta_n);
            if (!finalRow) throw new Error("No se pudo obtener el ID del acta final.");

            const actaId = finalRow.id;
            db.prepare("DELETE FROM equipos WHERE acta_id = ?").run(actaId);
            const equipoStmt = db.prepare(`INSERT INTO equipos (acta_id, tipo, marca, desc, mtm, serie, estado, codigo, dano, faltante) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            equipos.forEach(eq => equipoStmt.run(actaId, eq.tipo, eq.marca, eq.desc, eq.mtm, eq.serie, eq.estado, eq.codigo, eq.dano ? 1 : 0, eq.faltante ? 1 : 0));
        });

        dashboardTransaction();
        return { success: true };
    } catch (err) {
        console.error('Error al añadir al dashboard:', err);
        return { success: false, message: err.message };
    }
});
/*--------------------------------------------------------
    ipcMain.handle('get-dashboard-data', () => {
        try {
            const rows = db.prepare("SELECT dashboard_data FROM actas WHERE status = 'FINALIZED'").all();
            return rows.map(r => JSON.parse(r.dashboard_data));
        } catch (err) {
            console.error(err.message);
            return [];
        }
    });
*/
    ipcMain.handle('get-dashboard-data', () => {
        try {
            //const rows = db.prepare("SELECT dashboard_data FROM actas WHERE status = 'FINALIZED'").all();
            const rows = db.prepare("SELECT dashboard_data FROM actas WHERE status = 'FINALIZED' ORDER BY fecha DESC").all();
            // Usamos flatMap para aplanar el array de arrays de filas en una sola lista
            return rows.flatMap(r => JSON.parse(r.dashboard_data || '[]'));
        } catch (err) {
            console.error(err.message);
            return [];
        }
    });

    ipcMain.handle('get-all-assets-data', () => {
        try {
            const rows = db.prepare(`
                SELECT e.tipo, e.marca, e.desc, e.serie, e.dano, e.estado, e.faltante, a.acta_n, a.fecha, a.nombre as usuario_original, a.tipo_acta
                FROM equipos e
                JOIN actas a ON e.acta_id = a.id
                WHERE a.status = 'FINALIZED'
            `).all();

            return rows.map(row => ({
                'Tipo Acta': row.tipo_acta, 'Tipo': row.tipo, 'Marca': row.marca,
                'Descripción': row.desc, 'Serie': row.serie, 'Daño': row.dano ? 'SÍ' : 'NO',
                'Estado': row.estado, 'Faltante': row.faltante ? 'SÍ' : 'NO',
                'Acta N°': row.acta_n,
                'Fecha': new Date(row.fecha + 'T00:00:00').toLocaleDateString('es-ES'),
                'Usuario Original': row.usuario_original,
            }));
        } catch (err) {
            console.error(err.message);
            return [];
        }
    });

    ipcMain.handle('save-pdf', async (event, { pdfData, folderName, filename }) => {
        try {
            const documentsPath = app.getPath('documents');
            const savePath = path.join(documentsPath, folderName);
            if (!fs.existsSync(savePath)) {
                fs.mkdirSync(savePath, { recursive: true });
            }
            const filePath = path.join(savePath, filename);
            fs.writeFileSync(filePath, Buffer.from(pdfData));
            return { success: true, path: filePath };
        } catch (error) {
            console.error('Error al guardar PDF:', error);
            return { success: false, message: error.message };
        }
    });
}

// --- Flujo Principal de la Aplicación ---
async function main() {
    await app.whenReady();
    
    initializeDatabase();
    registerIpcHandlers();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
}
/*
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        if (db) {
            db.close();
            console.log('Base de datos cerrada.');
        }
        app.quit();
    }
});
*/
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        // --- ASEGÚRATE DE QUE ESTAS LÍNEAS ESTÉN AQUÍ ---
        sessionAdUsername = null;
        sessionAdPassword = null;
        console.log("Credenciales de sesión de AD limpiadas.");
        // ------------------------------------
        if (db) {
            db.close();
            console.log('Base de datos cerrada.');
        }
        app.quit();
    }
});

main().catch(err => { // ✅ ¡CORREGIDO! Ya no está la 'n'
    console.error("Fallo al inicializar la aplicación:", err);
    app.quit();
});
