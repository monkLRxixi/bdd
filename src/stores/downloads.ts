import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  DownloadProgress,
  DownloadRequest,
  TaskStatus,
} from "@/lib/types";

export interface DownloadTask {
  id: string;
  title: string;
  part: string;
  page: number;
  isMulti: boolean;
  bvid: string;
  mode: "dash" | "mp4";
  quality: string;
  status: TaskStatus;
  phase: string;
  percent: number;
  received: number;
  total: number;
  speed: number;
  message: string;
  file?: string;
  createdAt: number;
}

interface DownloadStore {
  tasks: Record<string, DownloadTask>;
  addTask: (req: DownloadRequest, quality: string) => void;
  applyProgress: (progress: DownloadProgress) => void;
  markCanceled: (id: string) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
}

export const isFinished = (status: TaskStatus) =>
  status === "done" || status === "error" || status === "canceled";

export const isActive = (status: TaskStatus) =>
  status === "downloading" || status === "merging" || status === "queued";

export const useDownloadStore = create<DownloadStore>()(
  persist(
    (set) => ({
      tasks: {},

      addTask: (req, quality) =>
        set((state) => ({
          tasks: {
            ...state.tasks,
            [req.id]: {
              id: req.id,
              title: req.title,
              part: req.part,
              page: req.page,
              isMulti: req.isMulti,
              bvid: req.bvid,
              mode: req.mode,
              quality,
              status: "downloading",
              phase: "prepare",
              percent: 0,
              received: 0,
              total: 0,
              speed: 0,
              message: "正在准备下载…",
              createdAt: Date.now(),
            },
          },
        })),

      applyProgress: (progress) =>
        set((state) => {
          const task = state.tasks[progress.id];
          if (!task) return state;
          return {
            tasks: {
              ...state.tasks,
              [progress.id]: {
                ...task,
                status: progress.status,
                phase: progress.phase,
                percent: progress.percent,
                received: progress.received || task.received,
                total: progress.total || task.total,
                speed: progress.speed,
                message: progress.message || task.message,
                file: progress.file ?? task.file,
              },
            },
          };
        }),

      markCanceled: (id) =>
        set((state) => {
          const task = state.tasks[id];
          if (!task) return state;
          return {
            tasks: {
              ...state.tasks,
              [id]: { ...task, status: "canceled", speed: 0, message: "已取消" },
            },
          };
        }),

      remove: (id) =>
        set((state) => {
          const tasks = { ...state.tasks };
          delete tasks[id];
          return { tasks };
        }),

      clearFinished: () =>
        set((state) => ({
          tasks: Object.fromEntries(
            Object.entries(state.tasks).filter(([, task]) => !isFinished(task.status)),
          ),
        })),
    }),
    {
      name: "bilidown-tasks",
      version: 1,
      partialize: (state) => ({
        tasks: Object.fromEntries(
          Object.entries(state.tasks).filter(([, task]) => isFinished(task.status)),
        ),
      }),
    },
  ),
);

export const useActiveTaskCount = () =>
  useDownloadStore(
    (state) =>
      Object.values(state.tasks).filter((task) => isActive(task.status)).length,
  );
