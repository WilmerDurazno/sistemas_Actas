// preload.js

const { contextBridge, ipcRenderer } = require('electron');

// Exponer un objeto 'api' en el objeto 'window' del frontend
contextBridge.exposeInMainWorld('api', {

    // --- Funciones de Directorio Activo ---
    setAdCredentials: (params) => ipcRenderer.invoke('set-ad-credentials', params),
    searchAdReal: (params) => ipcRenderer.invoke('search-ad-real', params),

    // --- Funciones de Archivos y PDF ---
    getImageAsBase64: (imageName) => ipcRenderer.invoke('get-image-base64', imageName),
    savePdf: (pdfOptions) => ipcRenderer.invoke('save-pdf', pdfOptions),
    openPdf: (filePath) => ipcRenderer.invoke('open-pdf-externally', filePath),

    // --- Funciones para Actas y Dashboards ---
    addActaToDashboard: (data) => ipcRenderer.invoke('add-to-dashboard', data),
    getDashboardData: () => ipcRenderer.invoke('get-dashboard-data'),
    getAllAssetsData: () => ipcRenderer.invoke('get-all-assets-data'),
    
    // --- Funciones para Borradores ---
    saveDraft: (draftData) => ipcRenderer.invoke('save-draft', draftData),
    loadDraft: (acta_n) => ipcRenderer.invoke('load-draft', acta_n),
    getDrafts: (searchTerm) => ipcRenderer.invoke('get-drafts', searchTerm),
    deleteDraft: (draftId) => ipcRenderer.invoke('delete-draft', draftId),

    // --- Funciones para Actas Finalizadas ---
    getFinalizedActas: (searchTerm) => ipcRenderer.invoke('get-finalized-actas', searchTerm)
});