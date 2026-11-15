// Selected public USC sections, Spring 2027.
export const courses = [
  {
    "id": "MATH-245",
    "name": "Mathematics of Physics and Engineering I",
    "units": 4,
    "why": "Engineering math. Can fulfill the corequisite for BME 210 and EE 202 in the same term.",
    "prereq": [
      {
        "count": 1,
        "options": [
          [
            "MATH-226"
          ],
          [
            "MATH-227"
          ],
          [
            "MATH-229"
          ]
        ]
      }
    ],
    "coreq": [],
    "bundles": [
      [
        {
          "id": "39601",
          "mode": "Lecture",
          "clearance": false,
          "seats": 7,
          "instructors": [],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 780,
              "end": 830
            }
          ]
        },
        {
          "id": "39603",
          "mode": "Discussion",
          "clearance": false,
          "seats": 6,
          "instructors": [],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 900,
              "end": 950
            }
          ]
        }
      ],
      [
        {
          "id": "39605",
          "mode": "Lecture",
          "clearance": false,
          "seats": 4,
          "instructors": [],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 600,
              "end": 650
            }
          ]
        },
        {
          "id": "39606",
          "mode": "Discussion",
          "clearance": false,
          "seats": 5,
          "instructors": [],
          "meetings": [
            {
              "days": [
                3
              ],
              "start": 480,
              "end": 530
            }
          ]
        }
      ],
      [
        {
          "id": "39609",
          "mode": "Lecture",
          "clearance": false,
          "seats": 6,
          "instructors": [],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 660,
              "end": 710
            }
          ]
        },
        {
          "id": "39610",
          "mode": "Discussion",
          "clearance": false,
          "seats": 1,
          "instructors": [],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 600,
              "end": 650
            }
          ]
        }
      ],
      [
        {
          "id": "39609",
          "mode": "Lecture",
          "clearance": false,
          "seats": 6,
          "instructors": [],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 660,
              "end": 710
            }
          ]
        },
        {
          "id": "39611",
          "mode": "Discussion",
          "clearance": false,
          "seats": 5,
          "instructors": [],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 660,
              "end": 710
            }
          ]
        }
      ]
    ]
  },
  {
    "id": "BME-210",
    "name": "Biomedical Computer Simulation Methods",
    "units": 4,
    "why": "Biomedical engineering core. Completing it unlocks the BME 445A prerequisite.",
    "prereq": [],
    "coreq": [
      {
        "count": 1,
        "options": [
          [
            "MATH-245"
          ]
        ]
      }
    ],
    "bundles": [
      [
        {
          "id": "29200",
          "mode": "Lecture",
          "clearance": true,
          "seats": 22,
          "instructors": [
            "David D'Argenio"
          ],
          "meetings": [
            {
              "days": [
                0,
                2
              ],
              "start": 840,
              "end": 950
            }
          ]
        },
        {
          "id": "29211",
          "mode": "Discussion",
          "clearance": false,
          "seats": 20,
          "instructors": [],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 750,
              "end": 830
            }
          ]
        }
      ],
      [
        {
          "id": "29200",
          "mode": "Lecture",
          "clearance": true,
          "seats": 22,
          "instructors": [
            "David D'Argenio"
          ],
          "meetings": [
            {
              "days": [
                0,
                2
              ],
              "start": 840,
              "end": 950
            }
          ]
        },
        {
          "id": "29212",
          "mode": "Discussion",
          "clearance": false,
          "seats": 24,
          "instructors": [],
          "meetings": [
            {
              "days": [
                3
              ],
              "start": 570,
              "end": 650
            }
          ]
        }
      ]
    ]
  },
  {
    "id": "EE-202",
    "name": "Linear Circuits",
    "units": 4,
    "why": "Circuits requirement. Can fulfill a corequisite for BME 445A.",
    "prereq": [],
    "coreq": [
      {
        "count": 1,
        "options": [
          [
            "MATH-245"
          ]
        ]
      }
    ],
    "bundles": [
      [
        {
          "id": "30427",
          "mode": "Lecture",
          "clearance": false,
          "seats": 15,
          "instructors": [
            "Susan Schober"
          ],
          "meetings": [
            {
              "days": [
                1,
                3
              ],
              "start": 720,
              "end": 830
            }
          ]
        },
        {
          "id": "30429",
          "mode": "Lab",
          "clearance": false,
          "seats": 15,
          "instructors": [
            "Susan Schober"
          ],
          "meetings": [
            {
              "days": [
                0
              ],
              "start": 1080,
              "end": 1190
            }
          ]
        }
      ]
    ]
  },
  {
    "id": "EE-109",
    "name": "Introduction to Embedded Systems",
    "units": 4,
    "why": "Embedded systems course for the electronics path.",
    "prereq": [
      {
        "count": 1,
        "options": [
          [
            "EE-155"
          ],
          [
            "CSCI-102"
          ],
          [
            "CSCI-113"
          ]
        ]
      }
    ],
    "coreq": [],
    "bundles": [
      [
        {
          "id": "31395",
          "mode": "Lecture",
          "clearance": true,
          "seats": 52,
          "instructors": [
            "Mark Redekopp"
          ],
          "meetings": [
            {
              "days": [
                1,
                3
              ],
              "start": 660,
              "end": 740
            }
          ]
        },
        {
          "id": "30530",
          "mode": "Quiz",
          "clearance": false,
          "seats": 73,
          "instructors": [],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 1140,
              "end": 1250
            }
          ]
        },
        {
          "id": "30799",
          "mode": "Lab",
          "clearance": false,
          "seats": 7,
          "instructors": [],
          "meetings": [
            {
              "days": [
                2
              ],
              "start": 750,
              "end": 830
            }
          ]
        }
      ],
      [
        {
          "id": "31395",
          "mode": "Lecture",
          "clearance": true,
          "seats": 52,
          "instructors": [
            "Mark Redekopp"
          ],
          "meetings": [
            {
              "days": [
                1,
                3
              ],
              "start": 660,
              "end": 740
            }
          ]
        },
        {
          "id": "30530",
          "mode": "Quiz",
          "clearance": false,
          "seats": 73,
          "instructors": [],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 1140,
              "end": 1250
            }
          ]
        },
        {
          "id": "31292",
          "mode": "Lab",
          "clearance": false,
          "seats": 17,
          "instructors": [],
          "meetings": [
            {
              "days": [
                2
              ],
              "start": 930,
              "end": 1010
            }
          ]
        }
      ],
      [
        {
          "id": "31395",
          "mode": "Lecture",
          "clearance": true,
          "seats": 52,
          "instructors": [
            "Mark Redekopp"
          ],
          "meetings": [
            {
              "days": [
                1,
                3
              ],
              "start": 660,
              "end": 740
            }
          ]
        },
        {
          "id": "30530",
          "mode": "Quiz",
          "clearance": false,
          "seats": 73,
          "instructors": [],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 1140,
              "end": 1250
            }
          ]
        },
        {
          "id": "31018",
          "mode": "Lab",
          "clearance": false,
          "seats": 14,
          "instructors": [],
          "meetings": [
            {
              "days": [
                4
              ],
              "start": 660,
              "end": 740
            }
          ]
        }
      ],
      [
        {
          "id": "31291",
          "mode": "Lecture",
          "clearance": true,
          "seats": 13,
          "instructors": [
            "Mark Redekopp"
          ],
          "meetings": [
            {
              "days": [
                1,
                3
              ],
              "start": 750,
              "end": 830
            }
          ]
        },
        {
          "id": "30530",
          "mode": "Quiz",
          "clearance": false,
          "seats": 73,
          "instructors": [],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 1140,
              "end": 1250
            }
          ]
        },
        {
          "id": "30799",
          "mode": "Lab",
          "clearance": false,
          "seats": 7,
          "instructors": [],
          "meetings": [
            {
              "days": [
                2
              ],
              "start": 750,
              "end": 830
            }
          ]
        }
      ],
      [
        {
          "id": "31291",
          "mode": "Lecture",
          "clearance": true,
          "seats": 13,
          "instructors": [
            "Mark Redekopp"
          ],
          "meetings": [
            {
              "days": [
                1,
                3
              ],
              "start": 750,
              "end": 830
            }
          ]
        },
        {
          "id": "30530",
          "mode": "Quiz",
          "clearance": false,
          "seats": 73,
          "instructors": [],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 1140,
              "end": 1250
            }
          ]
        },
        {
          "id": "31292",
          "mode": "Lab",
          "clearance": false,
          "seats": 17,
          "instructors": [],
          "meetings": [
            {
              "days": [
                2
              ],
              "start": 930,
              "end": 1010
            }
          ]
        }
      ],
      [
        {
          "id": "31291",
          "mode": "Lecture",
          "clearance": true,
          "seats": 13,
          "instructors": [
            "Mark Redekopp"
          ],
          "meetings": [
            {
              "days": [
                1,
                3
              ],
              "start": 750,
              "end": 830
            }
          ]
        },
        {
          "id": "30530",
          "mode": "Quiz",
          "clearance": false,
          "seats": 73,
          "instructors": [],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 1140,
              "end": 1250
            }
          ]
        },
        {
          "id": "31018",
          "mode": "Lab",
          "clearance": false,
          "seats": 14,
          "instructors": [],
          "meetings": [
            {
              "days": [
                4
              ],
              "start": 660,
              "end": 740
            }
          ]
        }
      ]
    ]
  },
  {
    "id": "CHEM-105B",
    "name": "General Chemistry",
    "units": 4,
    "why": "Chemistry sequence. Check how it applies to your degree or pre-health plan.",
    "prereq": [
      {
        "count": 1,
        "options": [
          [
            "CHEM-105A"
          ],
          [
            "CHEM-107"
          ],
          [
            "CHEM-115A"
          ]
        ]
      }
    ],
    "coreq": [],
    "bundles": [
      [
        {
          "id": "17256",
          "mode": "Lecture",
          "clearance": false,
          "seats": 147,
          "instructors": [
            "Stuart Moon"
          ],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 540,
              "end": 590
            }
          ]
        },
        {
          "id": "17257",
          "mode": "Quiz",
          "clearance": false,
          "seats": 147,
          "instructors": [],
          "meetings": [
            {
              "days": [
                3
              ],
              "start": 930,
              "end": 1010
            }
          ]
        },
        {
          "id": "17293",
          "mode": "Lab",
          "clearance": false,
          "seats": 1,
          "instructors": [],
          "meetings": [
            {
              "days": [
                0
              ],
              "start": 780,
              "end": 950
            }
          ]
        }
      ],
      [
        {
          "id": "17256",
          "mode": "Lecture",
          "clearance": false,
          "seats": 147,
          "instructors": [
            "Stuart Moon"
          ],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 540,
              "end": 590
            }
          ]
        },
        {
          "id": "17257",
          "mode": "Quiz",
          "clearance": false,
          "seats": 147,
          "instructors": [],
          "meetings": [
            {
              "days": [
                3
              ],
              "start": 930,
              "end": 1010
            }
          ]
        },
        {
          "id": "17304",
          "mode": "Lab",
          "clearance": false,
          "seats": 1,
          "instructors": [],
          "meetings": [
            {
              "days": [
                0
              ],
              "start": 900,
              "end": 1070
            }
          ]
        }
      ],
      [
        {
          "id": "17258",
          "mode": "Lecture",
          "clearance": false,
          "seats": 160,
          "instructors": [
            "Thomas Bertolini"
          ],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 600,
              "end": 650
            }
          ]
        },
        {
          "id": "17259",
          "mode": "Quiz",
          "clearance": false,
          "seats": 160,
          "instructors": [],
          "meetings": [
            {
              "days": [
                3
              ],
              "start": 930,
              "end": 1010
            }
          ]
        },
        {
          "id": "17293",
          "mode": "Lab",
          "clearance": false,
          "seats": 1,
          "instructors": [],
          "meetings": [
            {
              "days": [
                0
              ],
              "start": 780,
              "end": 950
            }
          ]
        }
      ],
      [
        {
          "id": "17258",
          "mode": "Lecture",
          "clearance": false,
          "seats": 160,
          "instructors": [
            "Thomas Bertolini"
          ],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 600,
              "end": 650
            }
          ]
        },
        {
          "id": "17259",
          "mode": "Quiz",
          "clearance": false,
          "seats": 160,
          "instructors": [],
          "meetings": [
            {
              "days": [
                3
              ],
              "start": 930,
              "end": 1010
            }
          ]
        },
        {
          "id": "17304",
          "mode": "Lab",
          "clearance": false,
          "seats": 1,
          "instructors": [],
          "meetings": [
            {
              "days": [
                0
              ],
              "start": 900,
              "end": 1070
            }
          ]
        }
      ],
      [
        {
          "id": "17260",
          "mode": "Lecture",
          "clearance": false,
          "seats": 34,
          "instructors": [
            "Jessica Parr"
          ],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 660,
              "end": 710
            }
          ]
        },
        {
          "id": "17262",
          "mode": "Quiz",
          "clearance": false,
          "seats": 34,
          "instructors": [],
          "meetings": [
            {
              "days": [
                3
              ],
              "start": 930,
              "end": 1010
            }
          ]
        },
        {
          "id": "17293",
          "mode": "Lab",
          "clearance": false,
          "seats": 1,
          "instructors": [],
          "meetings": [
            {
              "days": [
                0
              ],
              "start": 780,
              "end": 950
            }
          ]
        }
      ],
      [
        {
          "id": "17260",
          "mode": "Lecture",
          "clearance": false,
          "seats": 34,
          "instructors": [
            "Jessica Parr"
          ],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 660,
              "end": 710
            }
          ]
        },
        {
          "id": "17262",
          "mode": "Quiz",
          "clearance": false,
          "seats": 34,
          "instructors": [],
          "meetings": [
            {
              "days": [
                3
              ],
              "start": 930,
              "end": 1010
            }
          ]
        },
        {
          "id": "17304",
          "mode": "Lab",
          "clearance": false,
          "seats": 1,
          "instructors": [],
          "meetings": [
            {
              "days": [
                0
              ],
              "start": 900,
              "end": 1070
            }
          ]
        }
      ]
    ]
  },
  {
    "id": "HBIO-301",
    "name": "Human Anatomy",
    "units": 4,
    "why": "A biology option in the published BME curriculum.",
    "prereq": [],
    "coreq": [],
    "bundles": [
      [
        {
          "id": "38434",
          "mode": "Lecture",
          "clearance": true,
          "seats": 39,
          "instructors": [
            "Kurt Kwast"
          ],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 540,
              "end": 590
            }
          ]
        },
        {
          "id": "38435",
          "mode": "Lab",
          "clearance": false,
          "seats": 6,
          "instructors": [
            "Joshua Carlos"
          ],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 660,
              "end": 830
            }
          ]
        }
      ],
      [
        {
          "id": "38434",
          "mode": "Lecture",
          "clearance": true,
          "seats": 39,
          "instructors": [
            "Kurt Kwast"
          ],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 540,
              "end": 590
            }
          ]
        },
        {
          "id": "38436",
          "mode": "Lab",
          "clearance": false,
          "seats": 3,
          "instructors": [
            "Jose Ubeda"
          ],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 840,
              "end": 1010
            }
          ]
        }
      ],
      [
        {
          "id": "38434",
          "mode": "Lecture",
          "clearance": true,
          "seats": 39,
          "instructors": [
            "Kurt Kwast"
          ],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 540,
              "end": 590
            }
          ]
        },
        {
          "id": "38437",
          "mode": "Lab",
          "clearance": false,
          "seats": 5,
          "instructors": [
            "Jose Ubeda"
          ],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 1020,
              "end": 1190
            }
          ]
        }
      ],
      [
        {
          "id": "38434",
          "mode": "Lecture",
          "clearance": true,
          "seats": 39,
          "instructors": [
            "Kurt Kwast"
          ],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 540,
              "end": 590
            }
          ]
        },
        {
          "id": "38440",
          "mode": "Lab",
          "clearance": false,
          "seats": 4,
          "instructors": [
            "Joshua Carlos"
          ],
          "meetings": [
            {
              "days": [
                2
              ],
              "start": 840,
              "end": 1010
            }
          ]
        }
      ],
      [
        {
          "id": "38434",
          "mode": "Lecture",
          "clearance": true,
          "seats": 39,
          "instructors": [
            "Kurt Kwast"
          ],
          "meetings": [
            {
              "days": [
                0,
                2,
                4
              ],
              "start": 540,
              "end": 590
            }
          ]
        },
        {
          "id": "38441",
          "mode": "Lab",
          "clearance": false,
          "seats": 5,
          "instructors": [
            "Joshua Carlos"
          ],
          "meetings": [
            {
              "days": [
                3
              ],
              "start": 840,
              "end": 1010
            }
          ]
        }
      ]
    ]
  },
  {
    "id": "BME-201",
    "name": "Biomedical Engineering Practice",
    "units": 2,
    "why": "A technical elective option in the published BME curriculum.",
    "prereq": [],
    "coreq": [],
    "bundles": [
      [
        {
          "id": "29202",
          "mode": "Lecture",
          "clearance": true,
          "seats": 29,
          "instructors": [
            "Cristina Zavaleta"
          ],
          "meetings": [
            {
              "days": [
                2
              ],
              "start": 720,
              "end": 830
            }
          ]
        }
      ]
    ]
  },
  {
    "id": "BME-445A",
    "name": "Senior Design Project",
    "units": 2,
    "why": "First senior design course. It is a prerequisite for BME 445B.",
    "prereq": [
      {
        "count": 1,
        "options": [
          [
            "BME-210"
          ]
        ]
      }
    ],
    "coreq": [
      {
        "count": 1,
        "options": [
          [
            "EE-202"
          ]
        ]
      }
    ],
    "bundles": [
      [
        {
          "id": "29206",
          "mode": "Lecture",
          "clearance": true,
          "seats": 17,
          "instructors": [
            "John Mai"
          ],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 960,
              "end": 1010
            }
          ]
        },
        {
          "id": "29237",
          "mode": "Lab",
          "clearance": false,
          "seats": 17,
          "instructors": [
            "John Mai"
          ],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 1050,
              "end": 1160
            }
          ]
        }
      ]
    ]
  },
  {
    "id": "BME-445B",
    "name": "Senior Design Project",
    "units": 2,
    "why": "Second senior design course. It follows BME 445A.",
    "prereq": [
      {
        "count": 1,
        "options": [
          [
            "BME-445A"
          ]
        ]
      }
    ],
    "coreq": [],
    "bundles": [
      [
        {
          "id": "29231",
          "mode": "Lecture",
          "clearance": true,
          "seats": 37,
          "instructors": [
            "John Mai"
          ],
          "meetings": [
            {
              "days": [
                4
              ],
              "start": 600,
              "end": 650
            }
          ]
        },
        {
          "id": "29232",
          "mode": "Lab",
          "clearance": false,
          "seats": 7,
          "instructors": [],
          "meetings": [
            {
              "days": [
                0
              ],
              "start": 780,
              "end": 950
            }
          ]
        }
      ],
      [
        {
          "id": "29231",
          "mode": "Lecture",
          "clearance": true,
          "seats": 37,
          "instructors": [
            "John Mai"
          ],
          "meetings": [
            {
              "days": [
                4
              ],
              "start": 600,
              "end": 650
            }
          ]
        },
        {
          "id": "29234",
          "mode": "Lab",
          "clearance": false,
          "seats": 13,
          "instructors": [],
          "meetings": [
            {
              "days": [
                1
              ],
              "start": 780,
              "end": 950
            }
          ]
        }
      ],
      [
        {
          "id": "29231",
          "mode": "Lecture",
          "clearance": true,
          "seats": 37,
          "instructors": [
            "John Mai"
          ],
          "meetings": [
            {
              "days": [
                4
              ],
              "start": 600,
              "end": 650
            }
          ]
        },
        {
          "id": "29236",
          "mode": "Lab",
          "clearance": false,
          "seats": 9,
          "instructors": [],
          "meetings": [
            {
              "days": [
                3
              ],
              "start": 930,
              "end": 1100
            }
          ]
        }
      ]
    ]
  }
];
