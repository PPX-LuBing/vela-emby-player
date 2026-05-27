import { createApp } from 'vue'
import App from './App.vue'
import { vuetify } from './plugins/vuetify'
import 'virtual:uno.css'
import './assets/main.css'

createApp(App).use(vuetify).mount('#app')
