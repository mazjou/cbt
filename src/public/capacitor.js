// Capacitor Native Plugins Integration
(function() {
  // Check if running in Capacitor
  const isCapacitor = window.Capacitor !== undefined;
  
  if (!isCapacitor) {
    console.log('Running in browser mode');
    return;
  }

  console.log('Running in Capacitor native mode');
  const { Capacitor } = window;
  const { App, PushNotifications, StatusBar, SplashScreen, Network } = Capacitor.Plugins;

  // ===== APP LIFECYCLE =====
  if (App) {
    App.addListener('appStateChange', ({ isActive }) => {
      console.log('App state changed. Is active?', isActive);
      if (isActive) {
        // Refresh notifications when app becomes active
        if (typeof window.loadNotifications === 'function') {
          window.loadNotifications();
        }
      }
    });

    App.addListener('backButton', ({ canGoBack }) => {
      if (!canGoBack) {
        App.exitApp();
      } else {
        window.history.back();
      }
    });
  }

  // ===== PUSH NOTIFICATIONS =====
  if (PushNotifications) {
    // Request permission
    PushNotifications.requestPermissions().then(result => {
      if (result.receive === 'granted') {
        PushNotifications.register();
      }
    });

    // Registration success
    PushNotifications.addListener('registration', (token) => {
      console.log('Push registration success, token: ' + token.value);
      // Send token to server
      fetch('/api/device/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.value, platform: 'android' })
      }).catch(err => console.error('Failed to register device token:', err));
    });

    // Registration error
    PushNotifications.addListener('registrationError', (error) => {
      console.error('Error on registration: ' + JSON.stringify(error));
    });

    // Notification received (app in foreground)
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push notification received: ', notification);
      
      // Show in-app notification
      if (typeof window.showInAppNotification === 'function') {
        window.showInAppNotification(notification);
      }
      
      // Refresh notification list
      if (typeof window.loadNotifications === 'function') {
        window.loadNotifications();
      }
    });

    // Notification tapped (app in background)
    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      console.log('Push notification action performed', notification);
      
      const data = notification.notification.data;
      
      // Navigate to appropriate page
      if (data.type === 'MATERIAL' && data.reference_id) {
        window.location.href = `/student/materials/${data.reference_id}`;
      } else if (data.type === 'EXAM' && data.reference_id) {
        window.location.href = `/student/exams/${data.reference_id}`;
      }
    });
  }

  // ===== STATUS BAR =====
  if (StatusBar) {
    StatusBar.setStyle({ style: 'DARK' });
    StatusBar.setBackgroundColor({ color: '#4F46E5' });
  }

  // ===== SPLASH SCREEN =====
  if (SplashScreen) {
    // Hide splash screen after page load
    window.addEventListener('load', () => {
      setTimeout(() => {
        SplashScreen.hide();
      }, 500);
    });
  }

  // ===== NETWORK STATUS =====
  if (Network) {
    Network.addListener('networkStatusChange', status => {
      console.log('Network status changed', status);
      
      // Show offline indicator
      if (!status.connected) {
        showOfflineIndicator();
      } else {
        hideOfflineIndicator();
        // Sync pending data when back online
        if (typeof window.syncPendingData === 'function') {
          window.syncPendingData();
        }
      }
    });

    // Check initial network status
    Network.getStatus().then(status => {
      if (!status.connected) {
        showOfflineIndicator();
      }
    });
  }

  // ===== HELPER FUNCTIONS =====
  function showOfflineIndicator() {
    let indicator = document.getElementById('offline-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'offline-indicator';
      indicator.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #EF4444;
        color: white;
        text-align: center;
        padding: 8px;
        font-size: 14px;
        z-index: 9999;
        font-weight: 500;
      `;
      indicator.textContent = '📡 Tidak ada koneksi internet';
      document.body.appendChild(indicator);
    }
  }

  function hideOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  // In-app notification display
  window.showInAppNotification = function(notification) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 70px;
      left: 16px;
      right: 16px;
      background: white;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      z-index: 9999;
      animation: slideDown 0.3s ease-out;
    `;
    
    toast.innerHTML = `
      <div style="display: flex; align-items: start; gap: 12px;">
        <div style="flex-shrink: 0; width: 40px; height: 40px; background: #4F46E5; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <svg style="width: 24px; height: 24px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
          </svg>
        </div>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; color: #1F2937; margin-bottom: 4px;">${notification.title || 'Notifikasi Baru'}</div>
          <div style="font-size: 14px; color: #6B7280;">${notification.body || ''}</div>
        </div>
      </div>
    `;
    
    document.body.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      toast.style.animation = 'slideUp 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
    
    // Click to dismiss
    toast.addEventListener('click', () => {
      toast.style.animation = 'slideUp 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    });
  };

  // Add CSS animations
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    @keyframes slideUp {
      from {
        transform: translateY(0);
        opacity: 1;
      }
      to {
        transform: translateY(-100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);

  console.log('Capacitor plugins initialized');
})();
