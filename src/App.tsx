import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { FileStorageService } from "./services/FileStorageService";
import { DropboxAuthService } from "./services/DropboxAuthService";
import { DropboxStorageService, DropboxSyncError } from "./services/DropboxStorageService";
import ConfirmationDialog from "./components/ConfirmationDialog";
import Toast from "./components/Toast";

interface SavedFile {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  size: number;
}

export default function App() {
  const { t } = useTranslation();
  const [savedFiles, setSavedFiles] = useState<SavedFile[]>([]);
  const [currentContent, setCurrentContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    isVisible: boolean;
  }>({
    message: '',
    type: 'info',
    isVisible: false
  });

  // Confirmation dialog state
  const [confirmationDialog, setConfirmationDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'danger',
    onConfirm: () => {}
  });

  const dropboxAuth = useMemo(() => new DropboxAuthService(), []);
  const dropboxStorage = useMemo(() => new DropboxStorageService(dropboxAuth), [dropboxAuth]);
  const fileStorage = useMemo(() => new FileStorageService(dropboxStorage), [dropboxStorage]);
  const isDropboxAvailable = dropboxStorage.isAvailable();
  const [isDropboxConnected, setIsDropboxConnected] = useState(dropboxStorage.isReady());

  // Helper functions for toast and confirmation
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ message, type, isVisible: true });
  };

  useEffect(() => {
    if (!isDropboxAvailable) {
      return;
    }

    void (async () => {
      const result = await dropboxAuth.processRedirectResult();
      if (result.status === 'success') {
        setIsDropboxConnected(true);
        showToast(t('fileEditor.validation.dropboxConnected'), 'success');
      } else if (result.status === 'error') {
        showToast(t('fileEditor.validation.dropboxAuthFailed', { message: result.message }), 'error');
      }
    })();
  }, [dropboxAuth, isDropboxAvailable, t]);

  useEffect(() => {
    loadSavedFiles();
  }, []);

  const showConfirmationDialog = (
    title: string,
    message: string,
    type: 'danger' | 'warning' | 'info',
    onConfirm: () => void
  ) => {
    setConfirmationDialog({
      isOpen: true,
      title,
      message,
      type,
      onConfirm
    });
  };

  const loadSavedFiles = async () => {
    try {
      const files = await fileStorage.listFiles();
      setSavedFiles(files);
    } catch (error) {
      console.error("Error loading files:", error);
      showToast(t('fileEditor.validation.errorLoading'), "error");
    }
  };

  const saveFile = async () => {
    if (!fileName.trim() || !currentContent.trim()) {
      showToast(t('fileEditor.validation.filenameRequired'), "warning");
      return;
    }

    setIsLoading(true);
    try {
      // Check if file already exists
      const fileExists = await fileStorage.fileExists(fileName);

      if (fileExists) {
        // Show overwrite confirmation
        setConfirmationDialog({
          isOpen: true,
          title: t('fileEditor.confirmOverwriteTitle'),
          message: t('fileEditor.confirmOverwriteMessage', { filename: fileName }),
          type: "warning",
          onConfirm: async () => {
            setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
            // Proceed with overwrite
            await performSave();
          }
        });
      } else {
        // File doesn't exist, save normally
        await performSave();
      }
    } catch (error) {
      console.error("Error saving file:", error);
      const errorMessage = error instanceof Error ? error.message : t('fileEditor.validation.errorSaving');
      showToast(errorMessage, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const performSave = async () => {
    try {
      await fileStorage.saveFile(fileName, currentContent);
      showToast(t('fileEditor.validation.fileSaved', { filename: fileName }), "success");
      setFileName("");
      setCurrentContent("");
      await loadSavedFiles(); // Refresh the file list
      setIsDropboxConnected(dropboxStorage.isReady());
    } catch (error) {
      if (error instanceof DropboxSyncError) {
        console.warn("Dropbox sync failed:", error);
        // File was saved locally but Dropbox sync failed
        showToast(t('fileEditor.validation.dropboxUploadFailed', { message: error.message }), "warning");
        setFileName("");
        setCurrentContent("");
        await loadSavedFiles();
        setIsDropboxConnected(dropboxStorage.isReady());
        return;
      }

      console.error("Error saving file:", error);
      const errorMessage = error instanceof Error ? error.message : t('fileEditor.validation.errorSaving');
      showToast(errorMessage, "error");
      throw error; // Re-throw to be caught by parent try-catch
    }
  };

  const loadFile = async (fileName: string) => {
    setIsLoading(true);
    try {
      const content = await fileStorage.loadFile(fileName);
      setCurrentContent(content);
      setFileName(fileName);
      showToast(t('fileEditor.validation.fileLoaded', { filename: fileName }), "success");
    } catch (error) {
      console.error("Error loading file:", error);
      const errorMessage = error instanceof Error ? error.message : t('fileEditor.validation.errorLoadingFile');
      showToast(errorMessage, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteFile = async (fileName: string) => {
    showConfirmationDialog(
      t('fileEditor.confirmDeleteTitle'),
      t('fileEditor.confirmDeleteMessage', { filename: fileName }),
      "danger",
      async () => {
        setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
        setIsLoading(true);
        try {
          await fileStorage.deleteFile(fileName);
          showToast(t('fileEditor.validation.fileDeleted', { filename: fileName }), "success");
          await loadSavedFiles(); // Refresh the file list
        } catch (error) {
          console.error("Error deleting file:", error);
          const errorMessage = error instanceof Error ? error.message : t('fileEditor.validation.errorDeleting');
          showToast(errorMessage, "error");
        } finally {
          setIsLoading(false);
        }
      }
    );
  };

  const clearAllFiles = async () => {
    showConfirmationDialog(
      t('fileEditor.confirmClearTitle'),
      t('fileEditor.confirmClearMessage'),
      "danger",
      async () => {
        setConfirmationDialog(prev => ({ ...prev, isOpen: false }));
        setIsLoading(true);
        try {
          await fileStorage.clearAll();
          showToast(t('fileEditor.validation.allFilesCleared'), "success");
          setSavedFiles([]);
          setCurrentContent("");
          setFileName("");
        } catch (error) {
          console.error("Error clearing files:", error);
          const errorMessage = error instanceof Error ? error.message : t('fileEditor.validation.errorClearing');
          showToast(errorMessage, "error");
        } finally {
          setIsLoading(false);
        }
      }
    );
  };

  const connectDropbox = () => {
    if (!isDropboxAvailable) {
      showToast(t('fileEditor.validation.dropboxAuthFailed', { message: t('fileEditor.dropbox.unavailable') }), 'error');
      return;
    }
    void dropboxAuth.startAuthentication();
  };

  const disconnectDropbox = () => {
    dropboxAuth.signOut();
    setIsDropboxConnected(false);
    showToast(t('fileEditor.validation.dropboxDisconnected'), 'info');
  };

  const testDropboxConnection = async () => {
    setIsLoading(true);
    try {
      const result = await dropboxStorage.testConnection();
      if (result.success) {
        showToast(`✅ ${result.message}`, 'success');
      } else {
        showToast(`❌ ${result.message}`, 'error');
      }
    } catch (error) {
      console.error('Connection test error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Connection test failed';
      showToast(`❌ Connection test failed: ${errorMessage}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const clearAndReconnectDropbox = () => {
    dropboxAuth.clearStoredData();
    setIsDropboxConnected(false);
    showToast('Cleared Dropbox data. Please connect again.', 'info');

    // Automatically start reconnection after a short delay
    setTimeout(() => {
      connectDropbox();
    }, 1000);
  };

  return (
    <div className="min-h-screen p-10 bg-slate-50 text-slate-900">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">
            {t('common.welcome')}
          </h1>
          <p className="text-lg text-slate-600">
            {t('common.description')}
          </p>
        </div>

        {isDropboxAvailable ? (
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {t('fileEditor.dropbox.title')}
              </h2>
              <p className="text-slate-600 text-sm">
                {isDropboxConnected
                  ? t('fileEditor.dropbox.statusConnected')
                  : t('fileEditor.dropbox.statusNotConnected')}
              </p>
            </div>
            <div className="flex gap-3">
              {isDropboxConnected ? (
                <>
                  <button
                    onClick={disconnectDropbox}
                    className="px-4 py-2 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-colors"
                  >
                    {t('fileEditor.dropbox.disconnect')}
                  </button>
                  <button
                    onClick={testDropboxConnection}
                    className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
                  >
                    Test Connection
                  </button>
                  <button
                    onClick={clearAndReconnectDropbox}
                    className="px-4 py-2 rounded-md bg-orange-600 text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
                  >
                    Clear & Reconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={connectDropbox}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                >
                  {t('fileEditor.dropbox.connect')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 text-sm">
            {t('fileEditor.dropbox.unavailable')}
          </div>
        )}

        {/* File Editor Section */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">{t('fileEditor.title')}</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('fileEditor.filename')}:</label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder={t('fileEditor.filenamePlaceholder')}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">{t('fileEditor.content')}:</label>
              <textarea
                value={currentContent}
                onChange={(e) => setCurrentContent(e.target.value)}
                placeholder={t('fileEditor.contentPlaceholder')}
                rows={8}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveFile}
                disabled={isLoading || !fileName.trim() || !currentContent.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isLoading ? t('fileEditor.saving') : t('fileEditor.saveFile')}
              </button>

              <button
                onClick={clearAllFiles}
                disabled={isLoading || savedFiles.length === 0}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {t('fileEditor.clearAllFiles')}
              </button>
            </div>
          </div>
        </div>

        {/* Saved Files Section */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">{t('fileEditor.savedFiles')} ({savedFiles.length})</h2>

          {savedFiles.length === 0 ? (
            <p className="text-gray-500 text-center py-8">{t('fileEditor.noFiles')}</p>
          ) : (
            <div className="grid gap-4">
              {savedFiles.map((file) => (
                <div key={file.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-medium">{file.name}</h3>
                      <p className="text-sm text-gray-500">
                        {t('fileEditor.created')}: {new Date(file.createdAt).toLocaleString()} • {t('fileEditor.size')}: {file.size} {t('fileEditor.bytes')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadFile(file.name)}
                        disabled={isLoading}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                      >
                        {t('fileEditor.load')}
                      </button>
                      <button
                        onClick={() => deleteFile(file.name)}
                        disabled={isLoading}
                        className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
                      >
                        {t('fileEditor.delete')}
                      </button>
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm text-gray-600 font-mono bg-gray-100 p-2 rounded text-xs truncate">
                      {file.content.length > 100 ? `${file.content.substring(0, 100)}...` : file.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-sm text-slate-500 text-center">
          If you can see this styled, Tailwind + React + Vite + i18n are working.
        </p>
      </div>

      {/* Toast Notifications */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast(prev => ({ ...prev, isVisible: false }))}
      />

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmationDialog.isOpen}
        title={confirmationDialog.title}
        message={confirmationDialog.message}
        type={confirmationDialog.type}
        isOverwrite={confirmationDialog.title === t('fileEditor.confirmOverwriteTitle')}
        onConfirm={confirmationDialog.onConfirm}
        onCancel={() => setConfirmationDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
