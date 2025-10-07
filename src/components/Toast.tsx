import { useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleCheck,
  faCircleInfo,
  faCircleXmark,
  faTriangleExclamation,
  faXmark
} from '@fortawesome/free-solid-svg-icons';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export default function Toast({
  message,
  type,
  isVisible,
  onClose,
  duration = 3000
}: ToastProps) {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  if (!isVisible) return null;

  const typeStyles = {
    success: 'bg-green-500 border-green-600',
    error: 'bg-red-500 border-red-600',
    warning: 'bg-yellow-500 border-yellow-600',
    info: 'bg-blue-500 border-blue-600'
  };

  const typeIcons = {
    success: faCircleCheck,
    error: faCircleXmark,
    warning: faTriangleExclamation,
    info: faCircleInfo
  };

  return (
    <div className={`fixed top-4 right-4 z-50 max-w-sm w-full ${typeStyles[type]} border-l-4 text-white p-4 rounded-md shadow-lg`}>
      <div className="flex items-center">
        <FontAwesomeIcon icon={typeIcons[type]} className="text-lg mr-3" />
        <p className="flex-1 text-sm font-medium">
          {message}
        </p>
        <button
          onClick={onClose}
          className="ml-3 text-white hover:text-gray-200 focus:outline-none focus:text-gray-200"
          aria-label="Close notification"
        >
          <FontAwesomeIcon icon={faXmark} className="text-base" />
        </button>
      </div>
    </div>
  );
}
