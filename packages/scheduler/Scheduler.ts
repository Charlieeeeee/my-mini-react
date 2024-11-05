import {
  Prioritylevel,
  NoPriority,
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  IdlePriority,
} from './SchedulerProperties'
import {
  peek,
  pop,
  push
} from './SchedulerMinHeap'
import {
  getCurrentTime
} from 'shared'
type Callback = (arg: boolean) => Callback | null | undefined

export type Task = {
  id: number;
  callback: Callback | null;
  priorityLevel: Prioritylevel;
  startTime: number;
  expirationTime: number;
  sortIndex: number;
}

const maxSigned31BitInt = 1073741823;

// Times out immediately
const IMMEDIATE_PRIORITY_TIMEOUT = -1;
// Eventually times out
const USER_BLOCKING_PRIORITY_TIMEOUT = 250;
const NORMAL_PRIORITY_TIMEOUT = 5000;
const LOW_PRIORITY_TIMEOUT = 10000;

let isHostCallbackScheduled = false;

let isMessageLoopRunning = false;

// 是否有任务在倒计时
let isHostTimeoutScheduled = false

// 是否有work 在执行
let isPerformingWork = false; // 锁 防止重复调度

let taskTimerID = -1;

// 标记 task 的唯一性
let taskIdCounter = 1
// callback 是任务的初始值， task 是 scheduler 封装之后的任务， work 是一个时间切片内的工作单元，可以执行多个 task

// 何时交还控制权给主线程
// 记录时间切片的起始值，时间戳
let startTime = -1;
// 时间切片，这个是时间段
let frameInterval = 5
function shouldYieldToHost() {
  const timeElapsed = getCurrentTime() - startTime

  if (timeElapsed < frameInterval) {
    return false
  }

  return true
}

function requestHostTimeout(
  callback: (currentTime: number) => void,
  ms: number
) {
  taskTimerID = setTimeout(() => {
    callback(getCurrentTime());
  }, ms)
}
function cancelHostTimeout() {
  clearTimeout(taskTimerID)
  taskTimerID = -1
}
// workLoop 
// 循环执行 work 的函数如下

// 任务池，小顶堆
const taskQueue: Array<Task> = [] // 没有延迟的任务
const timerQueue: Array<Task> = [] // 有延迟的任务

let currentTask: Task | null = null
let currentPriorityLevel: Prioritylevel | null = null

// 任务调度器入口函数
function schedulerCallback(priorityLevel: Prioritylevel, callback: Callback, options?: { delay: number }) {
  const currentTime = getCurrentTime()
  let startTime 
  // 根据有无延迟设置 startTime
  if (typeof options === 'object' && options !== null) {
    let delay = options.delay
    if (typeof delay === 'number' && delay > 0) {
      // 有效的延迟时间
      startTime = currentTime + delay
    } else {
      startTime = currentTime
    }
  } else {
    startTime = currentTime
  }
  

  let timeout: number;
  switch(priorityLevel) {
    case ImmediatePriority:
      // 立即超时
      timeout = IMMEDIATE_PRIORITY_TIMEOUT;
      break;
    case UserBlockingPriority:
      // 最终超时
      timeout = USER_BLOCKING_PRIORITY_TIMEOUT;
      break;
    case IdlePriority:
      // 永不超时
      timeout = maxSigned31BitInt
      break;
    case LowPriority:
      // 最终超时
      timeout = LOW_PRIORITY_TIMEOUT;
      break;
    case NormalPriority:
    default: 
      // 最终超时
      timeout = NORMAL_PRIORITY_TIMEOUT;
      break;
  }
  const expirationTime = startTime + timeout;
  const newTask: Task = {
    id: taskIdCounter++,
    callback,
    priorityLevel,
    startTime,
    expirationTime,
    sortIndex: -1
  }

  if (startTime > currentTime) {
    // newTask 是有延迟到任务
    newTask.sortIndex = startTime
    push(timerQueue, newTask)
    // 任务在 timerQueue 中到达开始时间后，会被推倒 taskQueue 中

    // taskQueue 是空的（优先执行无延迟任务） 且 当前延迟任务处于 timerTask 堆顶 且 没有延迟任务在倒计时
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      if (isHostTimeoutScheduled) {
        // newTask 才是堆顶延迟任务，才应该最先到达执行时间，newTask 才应该被倒计时，其他延迟任务被倒计时了，说明有问题
        cancelHostTimeout()
      } else {
        isHostTimeoutScheduled = true
        requestHostTimeout(handleTimeout, startTime - currentTime)
      }
    }
  } else {
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask)
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback();
    }
  }
}

function handleTimeout(currentTime: number) {
  isHostTimeoutScheduled = false
  // 把延迟任务从 timerQueue 中推入 taskQueue
  advanceTimers(currentTime)
  if (!isHostCallbackScheduled) {
    // 主线程闲着
    if (peek(taskQueue) !== null) {
      // 有任务
      // 开启任务
      isHostCallbackScheduled = true
      requestHostCallback(); 
    } else {
      // 没有任务
      // 堆顶延迟任务开始倒计时
      let fisrtTimer = peek(timerQueue)
      if (fisrtTimer !== null) {
        requestHostTimeout(handleTimeout, fisrtTimer.startTime - currentTime)
      }
    }
  }
}

function advanceTimers(currentTime: number) {
  let timer = peek(timerQueue)
  // 循环把当前所有到达时间的有效延迟任务推入 taskQueue
  while(timer !== null) {
    if (timer.callback === null) {
      // 无效任务
      pop(timerQueue)
    } else if (timer.startTime <= currentTime) {
      // 有效任务
      // 且 到达开始时间的延迟任务
      pop(timerQueue)
      timer.sortIndex = timer.expirationTime
      push(taskQueue, timer)
    } else {
      // 有效任务
      // 没到达开始时间
      return
    }
    timer = peek(timerQueue)
  }
}

function requestHostCallback() {
  if (!isMessageLoopRunning) {
    isMessageLoopRunning = true
    schedulePerformWorkUntilDeadline()
  }
}

const channel = new MessageChannel()
const port = channel.port2
channel.port1.onmessage = performWorkUntilDeadline // 宏任务(不用 setTimeout 是因为有最小延迟 4ms)
function schedulePerformWorkUntilDeadline() {
  port.postMessage(null) 
}
function performWorkUntilDeadline() {
  if (isMessageLoopRunning) {
    const currentTime = getCurrentTime()
    // 记录了一个 work 的起始时间
    startTime = currentTime
    let hasMoreWork = false
    try {
      hasMoreWork = flushWork(currentTime)
    } finally {
      if (hasMoreWork) {
        schedulePerformWorkUntilDeadline()
      } else {
        isMessageLoopRunning = false
      }
    }
  }
}

function flushWork(initialTime) {
  isHostCallbackScheduled = false
  isPerformingWork = true

  let previousPriorityLevel = currentPriorityLevel
  try {
    return workLoop(initialTime)
  } finally {
    currentTask = null
    currentPriorityLevel = previousPriorityLevel
    isPerformingWork = false
  }
}

// 取消某个任务，由于最小对没法直接删除，因此只能初步把 task.callback 设置为 null
// 调度过程中，当这个任务位于堆顶时，删除
function cancelCallback(task) {
  task.callback = null
}

function getCurrentPriorityLevel(): Prioritylevel | null {
  return currentPriorityLevel
}

// 有很多 task, 每个 task 都有一个 callback， callback 执行完了，就执行下一个 task
// 一个 work 就是一个时间切片内执行的一些 task
// 时间切片要循环，就是 work 要循环（loop）
// 返回 true 表示还有任务没有执行完，需要继续执行
function workLoop(initialTime: number): boolean {
  let currentTime = initialTime;
  // 执行任务的时候也要把到达开始时间的延迟任务推入 taskQueue 中
  advanceTimers(currentTime)
  currentTask = peek(taskQueue)
  while(currentTask !== null) {
    // 当前任务没过期 且 超过了当前时间切片
    if (currentTask.expirationTime < currentTime && shouldYieldToHost()) {
      break;
    }
    // 执行任务
    const callback = currentTask.callback;
    if (typeof callback === 'function') {
      // 有效任务
      currentTask.callback = null;
      currentPriorityLevel = currentTask.priorityLevel;
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      const continuationCallback = callback(didUserCallbackTimeout)
      currentTime = getCurrentTime()
      if (typeof continuationCallback === 'function') {
        currentTask.callback = continuationCallback;
        // 检查到有新的任务, 也去检查...
        advanceTimers(currentTime)
        return true; // 还要执行一遍这个 currentTask
      } else {
        if (currentTask === peek(taskQueue)) { 
          pop(taskQueue);
        }
        advanceTimers(currentTime)
      }
    } else {
      // 无效任务
      
      pop(taskQueue)
    }

    currentTask = peek(taskQueue);
  }

  if (currentTask !== null) {
    return true
  } else {
    // taskQueue 里没有任务了

    let fisrtTimer = peek(timerQueue)
    if (fisrtTimer !== null) {
      requestHostTimeout(handleTimeout, fisrtTimer.startTime - currentTime)
    }

    return false
  }
}

export {
  Prioritylevel,
  NoPriority,
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  IdlePriority,
  schedulerCallback, // 某任务进入调度器，等待调用
  cancelCallback, // 取消某个任务，由于最小对没法直接删除，因此只能初步把 task.callback 设置为 null
  getCurrentPriorityLevel, // 获取当前正在执行任务的优先级
  shouldYieldToHost as shouldYield, // 把控制权交给主线程
}