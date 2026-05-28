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
import { Joyride, EVENTS, type EventData, type Step } from "react-joyride";
import { getGuideTourRouteForPathname } from "@/lib/guide-tour-route";
import {
  GUIDE_TOUR_STEPS,
  resolveDashboardSteps,
  resolvePoDetailSteps,
  resolveShipmentDetailSteps,
  resolveShipmentListSteps,
} from "@/config/guide-tour-steps";
import { setGuideTourDismissed } from "@/lib/guide-tour-storage";
import type { GuideTourRoute } from "@/types/guide-tour";
import { useToast } from "@/components/providers/ToastProvider";
import { GuideTourTooltip } from "./GuideTourTooltip";

type GuideTourContextValue = {
  startTour: () => void;
};

const GuideTourContext = createContext<GuideTourContextValue | null>(null);

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
    default:
      return GUIDE_TOUR_STEPS[route];
  }
}

export function GuideTourProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { pushToast } = useToast();
  const [run, setRun] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [activeRoute, setActiveRoute] = useState<GuideTourRoute | null>(null);
  const [dontShowAgain, setDontShowAgainState] = useState(false);
  const dontShowAgainRef = useRef(false);
  const activeRouteRef = useRef<GuideTourRoute | null>(null);

  useEffect(() => {
    activeRouteRef.current = activeRoute;
  }, [activeRoute]);

  const setDontShowAgain = useCallback((value: boolean) => {
    dontShowAgainRef.current = value;
    setDontShowAgainState(value);
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

  const checkboxContextValue = useMemo(
    () => ({ dontShowAgain, setDontShowAgain }),
    [dontShowAgain, setDontShowAgain]
  );

  const onEvent = useCallback((data: EventData) => {
    if (data.type === EVENTS.TOUR_END) {
      setRun(false);
      const route = activeRouteRef.current;
      if (route && dontShowAgainRef.current) {
        setGuideTourDismissed(route, true);
      }
      dontShowAgainRef.current = false;
      setDontShowAgainState(false);
      setActiveRoute(null);
    }
  }, []);

  return (
    <GuideTourContext.Provider value={contextValue}>
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
            scrollOffset: 96,
          }}
          styles={{
            tooltipContainer: {
              textAlign: "left",
            },
          }}
        />
      </GuideTourCheckboxContext.Provider>
    </GuideTourContext.Provider>
  );
}
