import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/fraunces/500.css'
import App from './App.vue'
import { router } from './router'
import './styles/main.css'

// L'invitation à installer arrive tôt : on la garde pour le bouton du Profil
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  ;(window as unknown as { __invite?: Event }).__invite = e
})

createApp(App).use(createPinia()).use(router).mount('#app')

// Service worker : appli disponible hors ligne et mise à jour automatique
registerSW({ immediate: true })
