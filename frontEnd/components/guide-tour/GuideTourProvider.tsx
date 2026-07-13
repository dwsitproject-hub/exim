"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { Joyride, EVENTS, STATUS, type EventData, type Step } from "react-joyride";
import { getGuideTourRouteForPathname } from "@/lib/guide-tour-route";
import {
  GUIDE_TOUR_STEPS,
  resolveDashboardSteps,
  resolvePoDetailSteps,
  resolveShipmentDetailSteps,
  resolveShipmentListSteps,
  resolveExportBulkingListSteps,
  resolveExportBulkingDetailSteps,
} from "@/config/guide-tour-steps";
import { setGuideTourDismissed } from "@/lib/guide-tour-storage";
import { clearFirstTimeUser, isFirstTimeUser } from "@/lib/first-time-user-storage";
import type { GuideTourRoute, GuideTourRouteHooks } from "@/types/guide-tour";
import { useToast } from "@/components/providers/ToastProvider";
import { useAuth } from "@/hooks/use-auth";
import { GuideTourTooltip } from "./GuideTourTooltip";
import "./guide-tour-globals.css";

type GuideTourContextValue = {
  startTour: () => void;
};

const GuideTourContext = createContext<GuideTourContextValue | null>(null);

type GuideTourHooksContextValue = {
  registerRouteHooks: (route: GuideTourRoute, hooks: GuideTourRouteHooks) => () => void;
};

const GuideTourHooksContext = createContext<GuideTourHooksContextValue | null>(null);

export const GuideTourCheckboxContext = createContext<{
  dontShowAgain: boolean;
  setDontShowAgain: (value: boolean) => void;
} | null>(null);

export function useGuideTour() {
  const ctx = useContext(GuideTourContext);
  if (!ctx) {
    throw new Error("useGuideTour must be used within GuideTourProvider");
  }
  return ctx;
}

/** Register per-page hooks (e.g. open create modal before a tour step). */
export function useRegisterGuideTourHooks(route: GuideTourRoute, hooks: GuideTourRouteHooks) {
  const ctx = useContext(GuideTourHooksContext);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;

  useEffect(() => {
    if (!ctx) return;
    return ctx.registerRouteHooks(route, {
      onBeforeStep: (index) => hooksRef.current.onBeforeStep?.(index),
      onTourEnd: () => hooksRef.current.onTourEnd?.(),
    });
  }, [ctx, route]);
}

function buildStepsForRoute(route: GuideTourRoute): Step[] {
  switch (route) {
    case "dashboard":
      return resolveDashboardSteps();
    case "shipmentList":
      return resolveShipmentListSteps();
    case "shipmentDetail":
      return resolveShipmentDetailSteps();
    case "poDetail":
      return resolvePoDetailSteps();
    case "exportBulkingList":
      return resolveExportBulkingListSteps();
    case "exportBulkingDetail":
      return resolveExportBulkingDetailSteps();
    default:
      return GUIDE_TOUR_STEPS[route];
  }
}

function tourEnded(data: EventData): boolean {
  return (
    data.type === EVENTS.TOUR_END ||
    data.status === STATUS.FINISHED ||
    data.status === STATUS.SKIPPED
  );
}

export function GuideTourProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { pushToast } = useToast();
  const { user } = useAuth();
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [activeRoute, setActiveRoute] = useState<GuideTourRoute | null>(null);
  const [dontShowAgain, setDontShowAgainState] = useState(false);
  const dontShowAgainRef = useRef(false);
  const activeRouteRef = useRef<GuideTourRoute | null>(null);
  const routeHooksRef = useRef<Partial<Record<GuideTourRoute, GuideTourRouteHooks>>>({});

  useEffect(() => {
    activeRouteRef.current = activeRoute;
  }, [activeRoute]);

  const setDontShowAgain = useCallback((value: boolean) => {
    dontShowAgainRef.current = value;
    setDontShowAgainState(value);
  }, []);

  const registerRouteHooks = useCallback((route: GuideTourRoute, hooks: GuideTourRouteHooks) => {
    routeHooksRef.current[route] = hooks;
    return () => {
      if (routeHooksRef.current[route] === hooks) {
        delete routeHooksRef.current[route];
      }
    };
  }, []);

  const startTour = useCallback(() => {
    const route = getGuideTourRouteForPathname(pathname);
    if (!route) {
      pushToast("No guided tour is available for this page.", "info");
      return;
    }
    dontShowAgainRef.current = false;
    setDontShowAgainState(false);
    const nextSteps = buildStepsForRoute(route);
    if (nextSteps.length === 0) {
      pushToast("No guided tour steps for this page.", "info");
      return;
    }
    setActiveRoute(route);
    setSteps(nextSteps);
    setRun(true);
  }, [pathname, pushToast]);

  const contextValue = useMemo(() => ({ startTour }), [startTour]);

  const hooksContextValue = useMemo(
    () => ({ registerRouteHooks }),
    [registerRouteHooks],
  );

  const checkboxContextValue = useMemo(
    () => ({ dontShowAgain, setDontShowAgain }),
    [dontShowAgain, setDontShowAgain],
  );

  const finishTour = useCallback(() => {
    setRun(false);
    const route = activeRouteRef.current;
    if (route) {
      routeHooksRef.current[route]?.onTourEnd?.();
    }
    if (route && dontShowAgainRef.current) {
      setGuideTourDismissed(route, true);
    }
    if (isFirstTimeUser(user?.id)) {
      clearFirstTimeUser(user?.id);
    }
    dontShowAgainRef.current = false;
    setDontShowAgainState(false);
    setActiveRoute(null);
  }, [user?.id]);

  const onEvent = useCallback(
    (data: EventData) => {
      if (data.type === EVENTS.STEP_BEFORE && typeof data.index === "number") {
        const route = activeRouteRef.current;
        if (route) {
          routeHooksRef.current[route]?.onBeforeStep?.(data.index);
        }
      }
      if (tourEnded(data)) {
        finishTour();
      }
    },
    [finishTour],
  );

  return (
    <GuideTourContext.Provider value={contextValue}>
      <GuideTourHooksContext.Provider value={hooksContextValue}>
        <GuideTourCheckboxContext.Provider value={checkboxContextValue}>
          {children}
          <Joyride
            run={run}
            steps={steps}
            continuous
            scrollToFirstStep
            tooltipComponent={GuideTourTooltip}
            onEvent={onEvent}
            locale={{ back: "Back", close: "Close", last: "Finish", next: "Next", skip: "Skip" }}
            options={{
              primaryColor: "#c43a31",
              textColor: "#2b2b2b",
              overlayColor: "rgba(43, 43, 43, 0.52)",
              spotlightRadius: 10,
              zIndex: 10100,
              arrowColor: "#ffffff",
              scrollDuration: 400,
              scrollOffset: 140,
            }}
            styles={{
              tooltipContainer: {
                textAlign: "left",
              },
            }}
          />
        </GuideTourCheckboxContext.Provider>
      </GuideTourHooksContext.Provider>
    </GuideTourContext.Provider>
  );
}
