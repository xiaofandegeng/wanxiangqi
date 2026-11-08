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
      path: '/research/roster',
      name: 'research-roster',
      component: () => import('../views/research.vue'),
      meta: { title: '选手玩法档案 - 王牌对决研究台', researchSection: 'roster' }
    },
    {
      path: '/research/predict',
      name: 'research-predict',
      component: () => import('../views/research.vue'),
      meta: { title: '赛前研究 - 王牌对决研究台', researchSection: 'predict' }
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
