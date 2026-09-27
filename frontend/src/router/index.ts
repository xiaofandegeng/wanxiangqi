import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'event-today',
      component: () => import('../views/event-today.vue'),
      meta: { title: '今日钻石狂潮 - 王牌对决数据站' }
    },
    {
      path: '/events/:id',
      name: 'event-detail',
      component: () => import('../views/event-detail.vue'),
      meta: { title: '单场对局深度对比 - 王牌对决数据站' }
    },
    {
      path: '/players/:id',
      name: 'player-profile',
      component: () => import('../views/player-profile.vue'),
      meta: { title: '选手数据画像 - 王牌对决数据站' }
    },
    {
      path: '/admin/verify',
      name: 'evidence-verify',
      component: () => import('../views/evidence-verify.vue'),
      meta: { title: '证据链与人工核验工作台 - 王牌对决数据站' }
    },
    {
      path: '/models/backtest',
      name: 'model-backtest',
      component: () => import('../views/model-backtest.vue'),
      meta: { title: '预测回测与基线评估 - 王牌对决数据站' }
    }
  ]
})

router.beforeEach((to, _from, next) => {
  if (to.meta.title) {
    document.title = to.meta.title as string
  }
  next()
})

export default router
