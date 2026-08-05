import { useState, useEffect } from "react";
import { parseLinkHeader } from "@web3-storage/parse-link-header";
import { XMLParser } from "fast-xml-parser";
import { getApiHeaders, getBaseUrl } from "../config";

export function useActivity() {
  const [data, setData] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  async function fetchPage(url: string, isNext: boolean) {
    try {
      setIsLoading(true);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          ...getApiHeaders(),
          "OCS-APIRequest": "true",
        },
      });

      const linkHeader = response.headers.get("Link");
      const parsed = parseLinkHeader(linkHeader);
      const nextUrl = parsed?.next?.url || null;

      const result = await response.text();
      if (!result) {
        if (!isNext) setData([]);
        setHasMore(false);
        setCursor(null);
        return;
      }

      const parser = new XMLParser();
      const dom = parser.parse(result) as any;
      if (!("ocs" in dom)) throw new Error("Invalid response: " + result);
      if (dom.ocs.meta.status === "failure") throw new Error(dom.ocs.meta.statuscode + ": " + dom.ocs.meta.message);

      const res = dom.ocs.data;
      const elements = res.element ? (Array.isArray(res.element) ? res.element : [res.element]) : [];
      const activities = elements.map((element: any) => {
        return {
          activityId: String(element.activity_id),
          app: element.app,
          type: element.type,
          user: element.user,
          subject: element.subject,
          objectType: element.object_type,
          objectName: element.object_name,
          objects: element.objects,
          link: element.link,
          icon: element.icon,
          datetime: element.datetime,
        } as Activity;
      });

      if (isNext) {
        setData((prev) => [...prev, ...activities]);
      } else {
        setData(activities);
      }
      setCursor(nextUrl);
      setHasMore(!!nextUrl);
    } catch (error) {
      console.error("Activity error:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchPage(`${getBaseUrl()}/ocs/v2.php/apps/activity/api/v2/activity?limit=200`, false);
  }, []);

  const onLoadMore = () => {
    if (cursor && !isLoading) {
      fetchPage(cursor, true);
    }
  };

  return {
    isLoading,
    activity: data,
    pagination: {
      hasMore,
      onLoadMore,
    },
  };
}

export interface Activity {
  activityId: string;
  app: string;
  type: string;
  user: string;
  subject: string;
  objectType: string;
  objectId: string;
  objectName: string;
  objects: Objects;
  link: string;
  icon: string;
  datetime: string;
}

interface Objects {
  element: string[] | string;
}
