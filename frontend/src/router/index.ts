import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'diamond-prediction',
      component: () => import('../views/event-today.vue'),
      meta: { title: '王牌对决已收录场次 - 王者万象棋数据站' }
    },
    {
      path: '/events/:id',
      name: 'event-detail',
      component: () => import('../views/event-detail.vue'),
      meta: { title: '单场对局详情 - 王者万象棋数据站' }
    },
    {
      path: '/players/:id',
      name: 'player-profile',
      component: () => import('../views/player-profile.vue'),
      meta: { title: '选手数据画像 - 王者万象棋数据站' }
    },
    {
      path: '/roster',
      name: 'player-roster',
      component: () => import('../views/player-roster.vue'),
      meta: { title: '选手数据一览 - 王者万象棋数据站' }
    },
    {
      path: '/lineups',
      name: 'lineup-roster',
      component: () => import('../views/lineup-roster.vue'),
      meta: { title: '第三方阵容快照参考 - 王者万象棋数据站' }
    },
    {
      path: '/lineups/:id',
      name: 'lineup-detail',
      component: () => import('../views/lineup-detail.vue'),
      meta: { title: '阵容快照详情 - 王者万象棋数据站' }
    },
    {
      path: '/archive',
      alias: '/matches',
      name: 'match-archive',
      component: () => import('../views/match-archive.vue'),
      meta: { title: '已核验对局流水 - 王者万象棋数据站' }
    },
    {
      path: '/admin/verify',
      name: 'evidence-verify',
      component: () => import('../views/evidence-verify.vue'),
      meta: { title: '证据链与人工核验工作台 - 王者万象棋数据站' }
    },
    {
      path: '/admin/personal-import',
      name: 'personal-evidence-import',
      component: () => import('../views/personal-evidence-import.vue'),
      meta: { title: '单人真实战绩导入 - 王者万象棋数据站' }
    },
    {
      path: '/models/backtest',
      name: 'model-backtest',
      component: () => import('../views/model-backtest.vue'),
      meta: { title: '预测模型状态 - 王者万象棋数据站' }
    }
  ]
})

router.beforeEach((to) => {
  if (to.meta.title) {
    document.title = to.meta.title as string
  }
})

export default router
