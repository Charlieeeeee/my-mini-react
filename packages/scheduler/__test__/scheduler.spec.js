import { describe, expect, test } from 'vitest'
import { 
  schedulerCallback,
  NoPriority,
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  IdlePriority,
} from '../Scheduler'
import {
  peek,
  pop,
  push
} from '../SchedulerMinHeap'


describe('测试 schedulerCallback', () => {
  test('四个不同优先级的任务', () => {
    // expect(sum(1, 2)).toBe(3)
    const eventTasks = []
    schedulerCallback(NormalPriority, () => {
      eventTasks.push('NormalPriority1')
      expect(eventTasks).toEqual(['ImmediatePriority', 'UserBlockingPriority', 'NormalPriority1'])
    })
    schedulerCallback(UserBlockingPriority, () => {
      eventTasks.push('UserBlockingPriority')
      expect(eventTasks).toEqual(['ImmediatePriority', 'UserBlockingPriority'])
    })
    schedulerCallback(ImmediatePriority, () => {
      eventTasks.push('ImmediatePriority')
      expect(eventTasks).toEqual(['ImmediatePriority'])
    })
    schedulerCallback(NormalPriority, () => {
      eventTasks.push('NormalPriority2')
      expect(eventTasks).toEqual(['ImmediatePriority', 'UserBlockingPriority', 'NormalPriority1', 'NormalPriority2'])
    })
  })
})