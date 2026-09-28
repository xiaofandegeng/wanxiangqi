import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'diamond-prediction',
      component: () => import('../views/event-today.vue'),
      meta: { title: '王牌对决钻石预测工作台 - 王者万象棋' }
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
      path: '/roster',
      name: 'player-roster',
      component: () => import('../views/player-roster.vue'),
      meta: { title: '选手战力天梯榜 - 王牌对决钻石预测' }
    },
    {
      path: '/lineups',
      name: 'lineup-roster',
      component: () => import('../views/lineup-roster.vue'),
      meta: { title: '阵容克制与胜率依据 - 王牌对决钻石预测' }
    },
    {
      path: '/lineups/:id',
      name: 'lineup-detail',
      component: () => import('../views/lineup-detail.vue'),
      meta: { title: '阵容流派详情 - 王牌对决数据站' }
    },
    {
      path: '/archive',
      alias: '/matches',
      name: 'match-archive',
      component: () => import('../views/match-archive.vue'),
      meta: { title: '历史对战记录大盘 - 王牌对决数据站' }
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

router.beforeEach((to) => {
  if (to.meta.title) {
    document.title = to.meta.title as string
  }
})

export default router
