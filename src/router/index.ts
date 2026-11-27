import { createRouter, createWebHashHistory } from 'vue-router'
import AccueilView from '@/views/AccueilView.vue'

// Historique « hash » (#/individu/3) : fonctionne sur GitHub Pages sans réglage serveur
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'accueil', component: AccueilView },
    { path: '/individu/nouveau', name: 'nouvel-individu', component: () => import('@/views/IndividuFormView.vue') },
    { path: '/individu/:id(\\d+)', name: 'individu', props: true, component: () => import('@/views/IndividuFormView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (_to, _from, position) => position ?? { top: 0 },
})
