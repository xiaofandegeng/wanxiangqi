// 王者万象棋阵容研习站 - 路由表 (v6 §3 信息架构)
// 公开主导航固定为：首页 / 新手学堂 / 阵容库 / 资料库 / 版本动态（管理端不进新手主导航）。
// 旧赛事/选手/预测路由不再注册，统一落入 catch-all（not-found 视图给出退役说明）。
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/home.vue'),
      meta: { title: '首页 - 王者万象棋阵容研习站' }
    },
    {
      path: '/learn',
      name: 'learn',
      component: () => import('../views/learn.vue'),
      meta: { title: '新手学堂 - 王者万象棋阵容研习站' }
    },
    {
      path: '/learn/:slug',
      name: 'lesson',
      component: () => import('../views/lesson.vue'),
      meta: { title: '课程 - 王者万象棋阵容研习站' }
    },
    {
      path: '/lineups',
      name: 'lineup-roster',
      component: () => import('../views/lineup-roster.vue'),
      meta: { title: '阵容库 - 王者万象棋阵容研习站' }
    },
    {
      path: '/lineups/:id',
      name: 'lineup-detail',
      component: () => import('../views/lineup-detail.vue'),
      meta: { title: '阵容详情 - 王者万象棋阵容研习站' }
    },
    {
      path: '/library',
      name: 'library',
      component: () => import('../views/library.vue'),
      meta: { title: '资料库 - 王者万象棋阵容研习站' }
    },
    {
      path: '/library/:kind/:slug',
      name: 'entity',
      component: () => import('../views/entity.vue'),
      meta: { title: '资料详情 - 王者万象棋阵容研习站' }
    },
    {
      path: '/updates',
      name: 'updates',
      component: () => import('../views/updates.vue'),
      meta: { title: '版本动态 - 王者万象棋阵容研习站' }
    },
    {
      path: '/updates/:slug',
      name: 'update-detail',
      component: () => import('../views/update-detail.vue'),
      meta: { title: '版本详情 - 王者万象棋阵容研习站' }
    },
    {
      path: '/admin/content',
      name: 'admin-content',
      component: () => import('../views/admin-content.vue'),
      meta: { title: '内容管理 - 王者万象棋阵容研习站' }
    },
    {
      path: '/admin/sources',
      name: 'admin-sources',
      component: () => import('../views/admin-sources.vue'),
      meta: { title: '来源与同步 - 王者万象棋阵容研习站' }
    },
    {
      // 兜底：旧 v2–v5 路由（赛事/选手/流水/预测/旧管理页）在此给出退役说明；
      // 其余未知路径如实 404。不注册旧路由本身 —— 退役即删除，不是隐藏。
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('../views/not-found.vue'),
      meta: { title: '页面不存在 - 王者万象棋阵容研习站' }
    }
  ]
})

router.beforeEach((to) => {
  if (to.meta.title) {
    document.title = to.meta.title as string
  }
})

export default router
