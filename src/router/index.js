import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  {
    path: '/',
    component: () => import('../components/environmentSetup/EnvironmentSetup.vue'),
  },
  {
    path: '/ui-checklist',
    component: () => import('../components/uiChecklist/UiChecklist.vue'),
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
