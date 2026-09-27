import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { EventItem, EventStatus, PlayerProfile } from '../types/event'
import { mockEvents, mockPlayerProfiles } from '../mock/events'

export const useEventStore = defineStore('event', () => {
  const events = ref<EventItem[]>(mockEvents)
  const playerProfiles = ref<Record<string, PlayerProfile>>(mockPlayerProfiles)
  const selectedDate = ref<string>('2026-09-27')
  const statusFilter = ref<EventStatus | 'ALL'>('ALL')

  const filteredEvents = computed(() => {
    return events.value.filter((item) => {
      const matchDate = item.scheduledAt.startsWith(selectedDate.value)
      const matchStatus = statusFilter.value === 'ALL' || item.status === statusFilter.value
      return matchDate && matchStatus
    })
  })

  function getEventById(id: string): EventItem | undefined {
    return events.value.find((e) => e.id === id)
  }

  function getPlayerProfile(id: string): PlayerProfile | undefined {
    return playerProfiles.value[id]
  }

  function confirmEvidence(eventId: string, evidenceId: string) {
    const targetEvent = getEventById(eventId)
    if (targetEvent && targetEvent.evidences) {
      const ev = targetEvent.evidences.find((e) => e.id === evidenceId)
      if (ev) {
        ev.status = 'CONFIRMED'
        ev.verifiedAt = new Date().toISOString().replace('T', ' ').substring(0, 19)
        ev.verifiedBy = 'CurrentAdmin'
      }
    }
  }

  function updateEventStatus(eventId: string, newStatus: EventStatus) {
    const targetEvent = getEventById(eventId)
    if (targetEvent) {
      targetEvent.status = newStatus
    }
  }

  return {
    events,
    selectedDate,
    statusFilter,
    filteredEvents,
    getEventById,
    getPlayerProfile,
    confirmEvidence,
    updateEventStatus
  }
})
