import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faHardDrive } from "@fortawesome/free-solid-svg-icons";
import { faDropbox, faGoogleDrive } from "@fortawesome/free-brands-svg-icons";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { FileStorageService, type StoredFile } from "./services/FileStorageService";
import { CloudSyncError, type CloudProvider } from "./services/CloudStorage";
import { DropboxAuthService } from "./services/DropboxAuthService";
import { DropboxStorageService } from "./services/DropboxStorageService";
import { GoogleDriveAuthService } from "./services/GoogleDriveAuthService";
import { GoogleDriveStorageService } from "./services/GoogleDriveStorageService";
import ConfirmationDialog from "./components/ConfirmationDialog";
import Toast from "./components/Toast";

export default function App() {
  const { t } = useTranslation();
  const [savedFiles, setSavedFiles] = useState<StoredFile[]>([]);
  const [conflictQueue, setConflictQueue] = useState<StoredFile[]>([]);
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
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'danger',
    onConfirm: undefined,
    onCancel: undefined
  });

  const dropboxAuth = useMemo(() => new DropboxAuthService(), []);
  const dropboxStorage = useMemo(() => new DropboxStorageService(dropboxAuth), [dropboxAuth]);
  const googleAuth = useMemo(() => new GoogleDriveAuthService(), []);
  const googleStorage = useMemo(() => new GoogleDriveStorageService(googleAuth), [googleAuth]);
  const fileStorage = useMemo(() => new FileStorageService(), []);

  const [activeProvider, setActiveProvider] = useState<CloudProvider | null>(() => {
    if (googleStorage.isReady()) {
      return 'googleDrive';
    }
    if (dropboxStorage.isReady()) {
      return 'dropbox';
    }
    if (googleStorage.isAvailable()) {
      return 'googleDrive';
    }
    if (dropboxStorage.isAvailable()) {
      return 'dropbox';
    }
    return null;
  });
  const [isDropboxConnected, setIsDropboxConnected] = useState(dropboxStorage.isReady());
  const [isGoogleConnected, setIsGoogleConnected] = useState(googleStorage.isReady());

  // Helper functions for toast and confirmation
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ message, type, isVisible: true });
  }, []);

  const showConfirmationDialog = (
    title: string,
    message: string,
    type: 'danger' | 'warning' | 'info',
    onConfirm: () => void,
    options?: {
      confirmText?: string;
      cancelText?: string;
      onCancel?: () => void;
    }
  ) => {
    setConfirmationDialog({
      isOpen: true,
      title,
      message,
      type,
      confirmText: options?.confirmText,
      cancelText: options?.cancelText,
      onConfirm,
      onCancel: options?.onCancel
    });
  };

  const hasDropbox = dropboxStorage.isAvailable();
  const hasGoogleDrive = googleStorage.isAvailable();

  const activeStorage = useMemo(() => {
    if (activeProvider === 'dropbox') {
      return dropboxStorage;
    }
    if (activeProvider === 'googleDrive') {
      return googleStorage;
    }
    return null;
  }, [activeProvider, dropboxStorage, googleStorage]);

  useEffect(() => {
    fileStorage.setCloudStorage(activeStorage ?? undefined);
  }, [fileStorage, activeStorage]);

  const resolveProviderName = useCallback((provider: CloudProvider | null) => {
    if (!provider) {
      return t('providers.none');
    }
    return t(`providers.${provider}`);
  }, [t]);

  const refreshConnectionStates = useCallback(() => {
    setIsDropboxConnected(dropboxStorage.isReady());
    setIsGoogleConnected(googleStorage.isReady());
  }, [dropboxStorage, googleStorage]);

  useEffect(() => {
    const dropboxAvailable = hasDropbox;
    const googleAvailable = hasGoogleDrive;

    if (activeProvider === 'dropbox' && !dropboxAvailable) {
      setActiveProvider(googleAvailable ? 'googleDrive' : null);
    } else if (activeProvider === 'googleDrive' && !googleAvailable) {
      setActiveProvider(dropboxAvailable ? 'dropbox' : null);
    }
  }, [activeProvider, hasDropbox, hasGoogleDrive]);

  const isActiveProviderConnected = activeProvider === 'dropbox'
    ? isDropboxConnected
    : activeProvider === 'googleDrive'
      ? isGoogleConnected
      : false;
  const activeProviderLabel = resolveProviderName(activeProvider);
  const selectedProviderIcon = activeProvider === 'dropbox'
    ? faDropbox
    : activeProvider === 'googleDrive'
      ? faGoogleDrive
      : faHardDrive;
  const selectedProviderIconClass = activeProvider === 'dropbox'
    ? 'text-sky-500'
    : activeProvider === 'googleDrive'
      ? 'text-emerald-500'
      : 'text-slate-400';

  const loadSavedFiles = useCallback(async () => {
    try {
      const { files, conflicts } = await fileStorage.listFiles();
      setSavedFiles(files);
      setConflictQueue(conflicts);
    } catch (error) {
      console.error("Error loading files:", error);
      showToast(t('fileEditor.validation.errorLoading'), "error");
    }
  }, [fileStorage, showToast, t]);

  const handleConflictUpload = useCallback(async (file: StoredFile) => {
    setConflictQueue(prev => prev.filter(conflict => conflict.id !== file.id));
    setIsLoading(true);
    try {
      await fileStorage.uploadLocalOnlyFile(file);
      const providerLabel = resolveProviderName(activeStorage?.provider ?? activeProvider);
      showToast(
        t('fileEditor.validation.cloudConflictUploaded', {
          filename: file.name,
          provider: providerLabel
        }),
        'success'
      );
    } catch (error) {
      const providerLabel = resolveProviderName(activeStorage?.provider ?? activeProvider);
      console.error('Failed to upload local-only file to cloud storage:', error);
      const message = error instanceof Error
        ? error.message
        : t('fileEditor.validation.cloudUploadFailedDefault', {
          provider: providerLabel
        });
      showToast(
        t('fileEditor.validation.cloudUploadFailed', {
          message,
          provider: providerLabel
        }),
        'error'
      );
    } finally {
      try {
        await loadSavedFiles();
      } finally {
        setIsLoading(false);
      }
    }
  }, [fileStorage, loadSavedFiles, showToast, t]);

  const handleConflictDiscard = useCallback(async (file: StoredFile) => {
    setConflictQueue(prev => prev.filter(conflict => conflict.id !== file.id));
    setIsLoading(true);
    try {
      fileStorage.discardLocalOnlyFile(file.name);
      const providerLabel = resolveProviderName(activeStorage?.provider ?? activeProvider);
      showToast(
        t('fileEditor.validation.cloudConflictDiscarded', {
          filename: file.name,
          provider: providerLabel
        }),
        'info'
      );
    } catch (error) {
      const providerLabel = resolveProviderName(activeStorage?.provider ?? activeProvider);
      console.error('Failed to discard local-only file:', error);
      const message = error instanceof Error
        ? error.message
        : t('fileEditor.validation.cloudDiscardFailedDefault', {
          provider: providerLabel
        });
      showToast(
        t('fileEditor.validation.cloudDiscardFailed', {
          message,
          provider: providerLabel
        }),
        'error'
      );
    } finally {
      try {
        await loadSavedFiles();
      } finally {
        setIsLoading(false);
      }
    }
  }, [fileStorage, loadSavedFiles, showToast, t]);

  useEffect(() => {
    if (!hasDropbox) {
      return;
    }

    void (async () => {
      const result = await dropboxAuth.processRedirectResult();
      if (result.status === 'success') {
        setIsDropboxConnected(true);
        showToast(
          t('fileEditor.validation.cloudConnected', {
            provider: resolveProviderName('dropbox')
          }),
          'success'
        );
        setActiveProvider((current) => current ?? 'dropbox');
      } else if (result.status === 'error') {
        showToast(
          t('fileEditor.validation.cloudAuthFailed', {
            provider: resolveProviderName('dropbox'),
            message: result.message
          }),
          'error'
        );
      }
    })();
  }, [dropboxAuth, hasDropbox, resolveProviderName, showToast, t]);

  useEffect(() => {
    setIsGoogleConnected(googleStorage.isReady());
  }, [googleStorage]);

  useEffect(() => {
    void loadSavedFiles();
  }, [loadSavedFiles, activeProvider]);

  useEffect(() => {
    if (activeProvider === 'dropbox' && !isDropboxConnected) {
      return;
    }
    if (activeProvider === 'googleDrive' && !isGoogleConnected) {
      return;
    }

    void loadSavedFiles();
  }, [activeProvider, isDropboxConnected, isGoogleConnected, loadSavedFiles]);

  useEffect(() => {
    if (conflictQueue.length === 0 || confirmationDialog.isOpen || isLoading) {
      return;
    }

    const conflict = conflictQueue[0];
    const providerLabel = resolveProviderName(activeProvider);

    setConfirmationDialog({
      isOpen: true,
      title: t('fileEditor.cloudConflictTitle', { provider: providerLabel }),
      message: t('fileEditor.cloudConflictMessage', { filename: conflict.name, provider: providerLabel }),
      type: 'warning',
      confirmText: t('fileEditor.cloudConflictUploadButton', { provider: providerLabel }),
      cancelText: t('fileEditor.cloudConflictDiscardButton'),
      onConfirm: () => {
        void handleConflictUpload(conflict);
      },
      onCancel: () => {
        void handleConflictDiscard(conflict);
      }
    });
  }, [activeProvider, conflictQueue, confirmationDialog.isOpen, handleConflictDiscard, handleConflictUpload, isLoading, resolveProviderName, t]);

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
        showConfirmationDialog(
          t('fileEditor.confirmOverwriteTitle'),
          t('fileEditor.confirmOverwriteMessage', { filename: fileName }),
          "warning",
          async () => {
            setIsLoading(true);
            try {
              await performSave();
            } finally {
              setIsLoading(false);
            }
          }
        );
        return;
      }

      // File doesn't exist, save normally
      await performSave();
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
      refreshConnectionStates();
    } catch (error) {
      if (error instanceof CloudSyncError) {
        console.warn(`${error.provider} sync failed:`, error);
        // File was saved locally but cloud sync failed
        showToast(
          t('fileEditor.validation.cloudUploadFailed', {
            message: error.message,
            provider: resolveProviderName(error.provider)
          }),
          "warning"
        );
        setFileName("");
        setCurrentContent("");
        await loadSavedFiles();
        refreshConnectionStates();
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
    if (!hasDropbox) {
      showToast(
        t('fileEditor.cloud.unavailable', { provider: resolveProviderName('dropbox') }),
        'error'
      );
      return;
    }
    void dropboxAuth.startAuthentication();
  };

  const disconnectDropbox = () => {
    dropboxAuth.signOut();
    setIsDropboxConnected(false);
    showToast(
      t('fileEditor.validation.cloudDisconnected', { provider: resolveProviderName('dropbox') }),
      'info'
    );
    refreshConnectionStates();
  };

  const connectGoogleDrive = async () => {
    if (!hasGoogleDrive) {
      showToast(
        t('fileEditor.cloud.unavailable', { provider: resolveProviderName('googleDrive') }),
        'error'
      );
      return;
    }

    try {
      await googleAuth.ensureAccessToken({ prompt: true });
      setIsGoogleConnected(true);
      setActiveProvider('googleDrive');
      showToast(
        t('fileEditor.validation.cloudConnected', {
          provider: resolveProviderName('googleDrive')
        }),
        'success'
      );
      refreshConnectionStates();
      await loadSavedFiles();
    } catch (error) {
      const message = error instanceof CloudSyncError
        ? error.message
        : error instanceof Error
          ? error.message
          : t('fileEditor.validation.cloudAuthFailedDefault', {
            provider: resolveProviderName('googleDrive')
          });
      showToast(
        t('fileEditor.validation.cloudAuthFailed', {
          provider: resolveProviderName('googleDrive'),
          message
        }),
        'error'
      );
    }
  };

  const disconnectGoogleDrive = () => {
    googleAuth.signOut();
    setIsGoogleConnected(false);
    showToast(
      t('fileEditor.validation.cloudDisconnected', {
        provider: resolveProviderName('googleDrive')
      }),
      'info'
    );
    refreshConnectionStates();
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

        {(hasDropbox || hasGoogleDrive) ? (
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 space-y-4">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">
                {t('fileEditor.cloud.title')}
              </h2>
              <p className="text-slate-600 text-sm">
                {t('fileEditor.cloud.description')}
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full sm:w-1/2">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t('fileEditor.cloud.providerLabel')}
                </label>
                <div className="relative">
                  <FontAwesomeIcon
                    icon={selectedProviderIcon}
                    className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg ${selectedProviderIconClass}`}
                  />
                  <select
                    value={activeProvider ?? ''}
                    onChange={(event) => {
                      const next = event.target.value as CloudProvider | '';
                      setActiveProvider(next === '' ? null : next);
                    }}
                    className="w-full appearance-none border border-slate-300 rounded-md bg-white pl-10 pr-10 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">{t('fileEditor.cloud.localOnlyOption')}</option>
                    {hasDropbox && (
                      <option value="dropbox">{t('providers.dropbox')}</option>
                    )}
                    {hasGoogleDrive && (
                      <option value="googleDrive">{t('providers.googleDrive')}</option>
                    )}
                  </select>
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400"
                  />
                </div>
              </div>

              {activeProvider && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-2 w-full sm:w-auto">
                  <div>
                    <p className="text-sm text-slate-600">
                      {isActiveProviderConnected
                        ? t('fileEditor.cloud.statusConnected', { provider: activeProviderLabel })
                        : t('fileEditor.cloud.statusNotConnected', { provider: activeProviderLabel })}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    {activeProvider === 'dropbox' ? (
                      isDropboxConnected ? (
                        <button
                          type="button"
                          onClick={disconnectDropbox}
                          className="px-4 py-2 border border-slate-300 rounded text-slate-700 hover:bg-slate-100 disabled:bg-gray-400 disabled:cursor-not-allowed w-full sm:w-auto"
                        >
                          {t('fileEditor.cloud.disconnectButton', { provider: activeProviderLabel })}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={connectDropbox}
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed w-full sm:w-auto"
                        >
                          {t('fileEditor.cloud.connectButton', { provider: activeProviderLabel })}
                        </button>
                      )
                    ) : activeProvider === 'googleDrive' ? (
                      isGoogleConnected ? (
                        <button
                          type="button"
                          onClick={disconnectGoogleDrive}
                          className="px-4 py-2 border border-slate-300 rounded text-slate-700 hover:bg-slate-100 disabled:bg-gray-400 disabled:cursor-not-allowed w-full sm:w-auto"
                        >
                          {t('fileEditor.cloud.disconnectButton', { provider: activeProviderLabel })}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={connectGoogleDrive}
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed w-full sm:w-auto"
                        >
                          {t('fileEditor.cloud.connectButton', { provider: activeProviderLabel })}
                        </button>
                      )
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 text-sm">
            {t('fileEditor.cloud.noneConfigured')}
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
                      <p className="text-xs text-gray-500 mt-1">
                        {t('fileEditor.storageLocation')}: {file.syncedProvider
                          ? t('fileEditor.locationSynced', { provider: resolveProviderName(file.syncedProvider) })
                          : t('fileEditor.locationLocal')}
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
        confirmText={confirmationDialog.confirmText}
        cancelText={confirmationDialog.cancelText}
        isOverwrite={confirmationDialog.title === t('fileEditor.confirmOverwriteTitle')}
        onConfirm={() => {
          const action = confirmationDialog.onConfirm;
          setConfirmationDialog(prev => ({
            ...prev,
            isOpen: false,
            confirmText: undefined,
            cancelText: undefined,
            onConfirm: undefined,
            onCancel: undefined
          }));
          if (action) {
            void action();
          }
        }}
        onCancel={() => {
          const cancelAction = confirmationDialog.onCancel;
          setConfirmationDialog(prev => ({ ...prev, isOpen: false, confirmText: undefined, cancelText: undefined, onConfirm: undefined, onCancel: undefined }));
          if (cancelAction) {
            void cancelAction();
          }
        }}
      />
    </div>
  );
}
