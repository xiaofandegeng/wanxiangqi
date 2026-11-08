// 王牌对决研究台 · 路由配置
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/research.vue'),
      meta: { title: '总览 - 王牌对决研究台', researchSection: 'overview' }
    },
    {
      path: '/research/roster',
      name: 'research-roster',
      component: () => import('../views/research.vue'),
      meta: { title: '选手玩法档案 - 王牌对决研究台', researchSection: 'roster' }
    },
    {
      path: '/research/sources',
      name: 'research-sources',
      component: () => import('../views/research.vue'),
      meta: { title: '来源资料 - 王牌对决研究台', researchSection: 'sources' }
    },
    {
      path: '/research/matches',
      name: 'research-matches',
      component: () => import('../views/research.vue'),
      meta: { title: '场次赛果 - 王牌对决研究台', researchSection: 'matches' }
    },
    {
      path: '/research/players',
      name: 'research-players',
      component: () => import('../views/research.vue'),
      meta: { title: '选手统计 - 王牌对决研究台', researchSection: 'players' }
    },
    {
      path: '/research/predict',
      name: 'research-predict',
      component: () => import('../views/research.vue'),
      meta: { title: '赛前研究 - 王牌对决研究台', researchSection: 'predict' }
    },
    {
      path: '/research/import',
      name: 'research-import',
      component: () => import('../views/research.vue'),
      meta: { title: '数据录入 - 王牌对决研究台', researchSection: 'import' }
    },
    {
      path: '/admin/sources',
      name: 'admin-sources',
      component: () => import('../views/admin-sources.vue'),
      meta: { title: '原件与来源 - 王牌对决研究台' }
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/not-found.vue'),
      meta: { title: '页面不存在 - 王牌对决研究台' }
    }
  ]
})

router.beforeEach((to) => {
  if (to.meta.title) {
    document.title = to.meta.title as string
  }
})

export default router
