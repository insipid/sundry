scheduleIsh({
  "version": 6,
  "settings": {
    "weekStart": 0,
    "visibleDays": [
      true,
      true,
      true,
      true,
      true,
      true,
      true
    ],
    "sidebar": "left",
    "sidebarHidden": false,
    "mode": "plan",
    "showNext": true,
    "newWeek": {
      "schedule": false,
      "regulars": true,
      "oneOffs": true
    },
    "finishWeek": {
      "schedule": false,
      "regulars": true,
      "oneOffs": true
    }
  },
  "weeks": [
    {
      "id": "w-example",
      "name": "An example week",
      "view": {
        "showEarly": false,
        "showEvening": false
      },
      "zones": {
        "early": 8,
        "morning": 10,
        "midday": 4,
        "afternoon": 10,
        "evening": 8
      },
      "blocks": [
        {
          "id": "x0",
          "day": 0,
          "start": 8,
          "size": 4,
          "title": "Gym",
          "color": 1,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x1",
          "day": 0,
          "start": 12,
          "size": 6,
          "title": "Job applications",
          "color": 0,
          "session": "just Acme",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x2",
          "day": 0,
          "start": 18,
          "size": 4,
          "title": "Lunch",
          "color": 4,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x3",
          "day": 0,
          "start": 24,
          "size": 8,
          "title": "Deep work",
          "color": 0,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x4",
          "day": 1,
          "start": 10,
          "size": 8,
          "title": "Deep work",
          "color": 0,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x5",
          "day": 1,
          "start": 18,
          "size": 4,
          "title": "Lunch",
          "color": 4,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x6",
          "day": 1,
          "start": 24,
          "size": 6,
          "title": "Admin",
          "color": 3,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x7",
          "day": 2,
          "start": 8,
          "size": 4,
          "title": "Gym",
          "color": 1,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x8",
          "day": 2,
          "start": 12,
          "size": 6,
          "title": "Job applications",
          "color": 0,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x9",
          "day": 2,
          "start": 18,
          "size": 4,
          "title": "Lunch",
          "color": 4,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x10",
          "day": 2,
          "start": 24,
          "size": 8,
          "title": "Portfolio",
          "color": 2,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x11",
          "day": 3,
          "start": 10,
          "size": 8,
          "title": "Deep work",
          "color": 0,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x12",
          "day": 3,
          "start": 18,
          "size": 4,
          "title": "Lunch",
          "color": 4,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x13",
          "day": 3,
          "start": 24,
          "size": 8,
          "title": "Portfolio",
          "color": 2,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x14",
          "day": 4,
          "start": 8,
          "size": 4,
          "title": "Gym",
          "color": 1,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x15",
          "day": 4,
          "start": 12,
          "size": 6,
          "title": "Deep work",
          "color": 0,
          "session": "",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        },
        {
          "id": "x16",
          "day": 4,
          "start": 24,
          "size": 6,
          "title": "Friends",
          "color": 5,
          "session": "pub quiz",
          "rating": null,
          "tags": [],
          "review": "",
          "actual": null
        }
      ],
      "unplanned": [],
      "dayNotes": [
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ],
      "focus": {
        "job applications": [
          {
            "text": "Tailor CV for Acme",
            "done": false
          },
          {
            "text": "Call Sam about an intro",
            "done": false
          }
        ],
        "portfolio": [
          {
            "text": "Case study 2 draft",
            "done": false
          }
        ],
        "deep work": [
          {
            "text": "Chapter 1 notes",
            "done": false
          }
        ]
      },
      "regulars": [
        {
          "id": "r-gym",
          "title": "Gym",
          "size": 6,
          "color": 1,
          "zone": "morning",
          "notes": []
        },
        {
          "id": "r-lunch",
          "title": "Lunch",
          "size": 4,
          "color": 4,
          "zone": "midday",
          "notes": []
        },
        {
          "id": "r-deep",
          "title": "Deep work",
          "size": 8,
          "color": 0,
          "zone": "morning",
          "notes": []
        }
      ],
      "unplaced": [
        {
          "id": "o1",
          "title": "Tidy the shed",
          "size": 4,
          "color": 2,
          "session": ""
        }
      ]
    }
  ],
  "currentWeek": "w-example",
  "tags": [
    "flow",
    "energised",
    "interrupted",
    "distracted",
    "too long",
    "too short",
    "wrong time",
    "should repeat"
  ],
  "timeHolders": [
    "lunch",
    "gym"
  ]
});
