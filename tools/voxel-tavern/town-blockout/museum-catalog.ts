export type MuseumImage = {
  url: string;
  credit: string;
  alt: string;
  page: string;
  licenseUrl: string;
};

export type MuseumExhibit = {
  title: string;
  date: string;
  text: string;
  source: string;
  url: string;
  image?: MuseumImage;
};

export type MuseumMonth = { month: number; items: MuseumExhibit[] };

// Public exhibition candidates reviewed on 2026-11-16 in China. Dates refer to
// the events themselves. Exhibit thumbnails retain their individual photo rights
// and credits. Their data URLs allow the standalone town to stay offline.
export const museumMonths: MuseumMonth[] = [
  {
    month: 1,
    items: [
      {
        title: '哈尔滨冰雪节开幕', date: '2026-01-05',
        text: '第42届中国·哈尔滨国际冰雪节在冰雪大世界开幕。游客走进冰雕城堡和冰灯主塔，现场还有烟花和无人机表演。',
        source: '文化和旅游部 · 黑龙江省文化和旅游厅',
        url: 'https://www.mct.gov.cn/whzx/qgwhxxlb/hlj/202601/t20260106_964014.htm',
        image: {
          credit: 'Garosio33 · CC0 1.0 · 2026年1月15日摄 · 缩小转码',
          alt: '冰雪节期间，夜间亮灯的冰雕蒸汽火车与彩色冰塔',
          page: 'https://commons.wikimedia.org/wiki/File:Harbin_Ice_%26_Snow_Festival_2026.jpg',
          licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
          url: 'data:image/webp;base64,UklGRj4VAABXRUJQVlA4IDIVAADwUQCdASr6ALsAPp1InUolpKKiKhjKMLATiU3ekTfvthhTfiAG+jhvvPOzuD+u4zQ3na3m7/53q0/UPsD89rzN+cP6VP8V6NPU5+hh0ymQ2dRPQtYsbL3DbOVAReNuHM02VUyzKBP5x5ZeoV0uPRVNUsA3QLiAboFxVmnihyijQMNvOcmetki8bGUtAwL3s3XPt6aUJ8PNmKbgLCGgRTHm0lRyzBYd4+6AXPyWk56HJgnMwvaYA9umwLd2pBxUYZ0lnqRA1M6PaSXAAQVfCI8mlNtexfXw/AX5sHqGEbIXQ+DJoDMsuocIYMqv40TkxpL9PMy4tNdCuQfEjHOA3eqR4spTOAIKOZJpYv58E7GQ4OIa1DUniYtoqHl11+P5cGUnR44okWvfufXG6wWP519+0lNaLxiqVXauE3KEhmtQ0YvynKM79mlRvj4ChNqLA6i5/TJW+4rS8KRwsvnixeNx9l3cuuHMzz62WYrHKvEWBioXuu7klDkGOsyRX5ZYwZCNQCbrRLicR/qIakcL5BaWPxdQRkGkQuJsOuVf2VJ1e+U1Pokz0h4Y5w1eVPXSdgn5BIYvBDD1MLh6D5QNNunJP399UUy13fe+FzP6phtLtGa1jSHT9TWczkXfgRtGlaP4KmvM2nw+c6fRSP6g4Hk/UZpGcZIYPbSEJ3Nr7E8cJA05yLeyD0PUY6i0Yah1tLeAnao1X5V4LzoisJh8BA5T88rybTj4P7oUN8pAyk6kREIWPorQoni2IlawDUbCm5bgyLKzf1nAcQFjzbBI07aYJXlR1eHF2JY8oSmYyGsB0Q97cryTeklvMRcWNf+PcEAdfCmO6NIYVIqCFRR2xmt583vMHngpwAVJkQy6dKgHd+tTLKGDTGPIAP76aO2lRbaR6YtikTlwyq6PnCGqR1Jle5WyKAP48dpa0mN0gsyh3xGDXtual4SVAw1fgJTqoWKg48S13rxBOnVMbWaDWB03A7UUINDPHWUUj09BN04hJvEqFTEVRvYeB937W2xpcUIPr3kLy4nP/FTmsmjBevtkz0ljpl5SVafVBk/lPmbSjU2BFORuhZ3k5NCJIjLcgEV0nUEI5NFDDI0WgEM1phu0fG57f0pZeLg9p/rNMwjPamCk5A9Bh/WVaTym3SwXMYYZGcaPm6U1PZ2o6uQtgvn5wCSYsfpA3K+tPwKkWff1C+13/BXoLCzyTbiTrOZ1IuSh5yif9LHha9JtStRZVb1m0au51mleW+E0dQrj6+kSMmcalUmILs8KV5oiXfThSrnPLnMPqOtkRm/T+bLivxy7Orbzh1zD2DZk4GcqeS68Ojp2KuqS4GYU6nir7jUucP1wjbV3/QZb2d6YDG4rd8yUuV9QXuPjC8lzZdPyETdB9xUTKJpFceCiYa6wsZKQYdY5Dcj21zSr5zAMbhb1Ob6vPuzpPZRY0jUsQW3fCj7eTiMMgxqNHCSXpzTihkKzjxWBnOkDVMQ8swW5WFQC8L34dyuWzW0wG3HFrZpbR0RdX+hNPd9crfn69f9MF6cfnmnXwAmQB4Pat03yB+5p719uWTlq+iFckp4sZ36biB079UV0hV0UDSfgzoFKkES9YX80A6SC+ZRW7GJTXimkGE99+DkIMPrbocAOo0GyrPV8I7ZM5J/x108z2NFM5BuZvaBhGWN3PjNYSuryjsJNjI0Mv8s79LCqgEPPQwoYFDBSpm5QhU+Xe8hY1OSb0moM/AwSkki1J1tTuOdP2n+oiynf8dnHvZNUeYJy3+73kVlT6zHvqhnpH+rVgTC8OvNr6CrTysThQatG4UCYYez7nvPdCCMjvI2EhurtrQXWTBAsICTb2CJ7of4BUmS1+hM3qXsZ95MgwuAVXwzgtJstPJdGq6h6Puace7x9xIF2PRYReD7B0Qbbyfbs484bYK3a18+LwZqI66kePYUD1PI8g/zEPgkbjh42LsnZlE95OqNIqP//jDagA5cRumizmqCiOhtuJJPZQu6wng108ChN3w/ViMfh+R4zAUWLyZjE4+ptAERZkWJ7N3bN1VItK3I5SP7SOijPD/EH2/pfkQWXzocEMCnhXo2YCayJ2fpZ8in1eTiL3acyhVwp749/GJkP05AnAs8RKBvDWr6wh5Lo22PDmLCS+0tYkf/53g1OPCHUfrBrQOIkCSdEz5IJNrCobaVT/QTXXTpXw4UF2vLJwiOKtpcWEMDgLq33vQ8TeqGgT5AW7rtSgmur/MKE5KiTFuAsGSAp2fPmYXVLaTtBm7zUdKSPnscYi1ZuheYADosNQvD0thSzoRMgH9uHUaHRtfMUUQoWgsNsA4wVoJLhW/od0v0NcnkgO3QmQQdfuP/ST9iln+ks8PciTMMjq9UiktiF/htJPOr+K442bIMlX0yy1g9JZoBYvWSjmk6X9cCddq71GvE4+2zMpbMl3JeejeoGBV34QJmNGA9zKkfFV4Rlh+xv6zUuggx6PSILZRuuAjs5ZsL9njjyWq6iBYLlykT0OyI9Q+ie1IEcsHrzf9/9f9IUFfVlRf0jwRbFv4zCucVvYdlyz1DCq0dQfbVCGqhO2WX3FCqoYSt2wwlRPnlBUIMmYCMdSc8XO/fp7OuO+QznU1YiGK/M7BVrALdkfNKHwS1qWo7g3d24Q63IM3MlzNdQ9yUUVt7t8XSAeKL1fAHfVmItNlwQeUdp665aCbYfHah3IkrVVbKGivcSa1yeja44WHelxhKDfYU2XxaSf9LLXTo2nANaZNrcKEoshEn1QeFNsUwc/Kpops4KchYR+YtIap9kccB5y3wY33alfyAkuGFYaq7Piz6PJ5wOAlxMM5bvdMVlRZi9OrwTH2MR59v9uSfSr+jYJWaD55uS1UTEZ7U+qbHWz9x1PjDs/0E+09g0uGL98pv+8mqfZpDyb+Jn3Z/b1VFFkZO4gItCXVAMPEaQP+48fsKtOeQmnQLlcqe9f184bNLlG2LTD7SNTL/96GeCDUYT9TWuX/rOzmE7/BF5+Kdf/B9Nw0s9CwS7roqtQi3mulo/daL+ZcgGP3xbxye/QYnPeWHKU7HGw4YEa/e9fFe6SXjp7Rmx7MB27XS8qeGNkj/8FOWsjrzYeUpHyMV3Kjnqjj3R1lC0EHmuHkrI9pXfdt5Io/6QQFmJAu7SKGsrBJK8ElwKwdlPC9fWo5gOhAKDarUFESjwDgqiqI7AQa6FioCHG2cKo4QJxVaeT/pELafb5X32FgmUVWnbWYTauM3GTB5K5yu3ZHYqlt2azwhgDw00y1b8wvVbWfW4rgU5Ani7n5mwtn8r+C3ZJYw4JvJoYmkibAcMgxQlziUWLvEWJSML+N9ikfKlQHjHvnXAyDnkXjzMhJt1FiZYHrUo0nydMRNX80pUkY9sc/eCu3JqkT2oeR7KsXsrpERiJhZ1OHtYu8j5h4OapeVKZlqbfbJU+9+1CSI8pOv+AvIr4bT6mewEBuG1CFwuCE+ZlRLX+TWsUi+uUU7Q2ExxoW/QrPU/FJ2GISHmygLWWruc2TDBrRuL9/pRz/mKbfTDidSBeu+Iwhqx1NwB+E5CWJG8WGN5C0B6UUHq7EffPqjLf+DlEV2U0rKMY1BYfFIr26D6YuHlY0XnioKj8cnZFk6wxq4asbBai7TjtEegR6bt/riq37VutU8Ec7F9iOl++Ql7g9NL1oLpQutUWL5axmHPIknYfZbNBvsnI/DvpyVQEZp7ApS4LvtYBfG3ribkluhKtG4ItI7gvEXJeCthCtLOOubu9qM7pH/eS+2lav6e4p2DOZESJ9gPojeToD+9h4QqGLBabFoNSMd3N2M0utkm0ZCl1xvbblINnfS5zWduR83UAP8Y4tZAGl/XqyQWLAX1LPulSSrwfl1hcLn809v6+N9R0DMFFmDodosY/TCpxNquRyYw7skMxkZtoKnliIla97vlkeHaPhdynGYQ/NZkf1jFADsaYHDOAZ6yh13+8sfM8kEC63N8H13H4w5rTo+RRxNXNm8eWGUw/qcyC1Bhky8JerRy+JOXoBsxD0NeV3yZChK2FI9aZuyblBVhTufJU8DhEEHcIrYNbd61h3H47UB8wnNfzcdmAEel5isEIIAjnmukfOMpd9DcHHk9JljHQYjPyUQAeB8l3Su1E/FsyxX9RSX40g14x6OuV1jR/WIQ/EQdHm+HxSvylq0PeGSj7ZLcIs8N/2H+keYk/84gFRwqNYbVHhOy4ZDNr/bHYXlgL3CMeBMYS3ZZJvWXW0uaOfS+YoyWX8gn8AHawyxEM96csHm2EKxmSSVbFcPIp55LwSDLI/oHcDotnYrgg81TnYdtNtm7yCryLnNdy/8qHbV8wQ6xbNJpR5gN0bwFTw3pkkIqfg5wAuAf0R05UHSSnHNExH8cnE1lDtBUUp3SUtQ6UgOX1BPbX6/tJ+2V6Si3z7ORQSgIvxOBq0dKXHS24eS4f9I2sEdq59bLHN74yHs2vjdfrtTIs2Gf9B5lUL976o/6IVx2k0hjiHseu+KHjSjeG044bAHQZnwRixzXszlQXYNhe1Z/n3maVsfUCnMirDTOV94+Xk9Zcd7s1y70BhYL2E91UzqqNa4Xs5/aeizU/U4jURiiwElPOsrwi5a74/yyssLItHAaV4C2ikHopux89J6xwNrEVAf4DOqI7S1xfUc6falU59lVvzLFs2NY8sbdHX1OidcOJMZ+EXxgxPnBjMjerE39YMzIbZvjQ73Q5JLDBgblXITdgfWRVZU/3qXUywQOA/HKlf4wWn61ssoofFmQz7T6fo6f+hpDTmhwXjUbky7tu3Dz7BPcXYaUMxO742h8jnvBF5CJNtBQHVw/VVR39XsldPs8YSJIhEOCspNmZURdzBzXX8YZMviTzVl4kB2Ki4t1QwM0BjLQQ5352eZfFdPFOdlbSPTjntAIEmcyfz0hdrCrcRYMvx/fEucLLpB/JjP1Q0C/52ROxEGq5oZCqSzEWeTvlIqkmimc0wIo0+TI5m4dyI+RZE/q+f3CjtuGw++DI9+iCZM1TYX2y4fy1TcobYyHA0SBnKV6SMovLO7x2SoaqE/xfsOYJ0oS3MBcnCSk/k/ORq3KAKcXpz4LDoqayVLCsNfKitHfyUjVVLZqmKQenjTEtymREc6e3q8Nh3Out6+TR2rbEmfrkAd4bUfn8FCTxotB3v0ruAm8YnK4py3Pe+yJ5Dq6YFR1cZSB9XJuii2AQi2FzW/kSW3nBNj3pLdkwV2fBLHtmFjad7TKg92oUztA08R5LG+t9Qyz2RLuW94kjf+U04785FAChzYLc31V1i5KNRWdk/qfBRjkEQ67TOqc0ho4nXAr/3NLCdnXnscNZxediUyGsLA2ZBHhmtt0+kcd+TMPgi4Yt8/4kO/PO7Ae/p5pWIIia3z436raRwyY3fDzkiziV/9c9580ZB8PkwCTwNAGmTS4v0JZ6Rr9Y/lMPg/I6+hUe/WTwfxL6f04OuGlF1gg7KGsmsW3U3GrAQX/t87D2eRZbjfqYtHn1l0Rig2adpM2daNRk5HqoutSpLlP8J5zosWbzoA51Rx/bFIKscaRVBOH5NMJlccvtOWUZFSm9MPcJnNqm4oDrk+zuqDLSHdLUCAe9QdUUB6TLUtvXl9p73HVm6UDXAtM1G1W1aIr8B4+J8qXQVIeFDO59YAVgvrsQ/LyTBalkQmps6ieXNAxzBGbKvS/9aNPWc5iGsC8PAsIehib+G3P5gJPz3rW2HF1cGYiejMWMzVGhhCEiwbvdqgFACvpqNQcdSEeDsJWmaRV6bP6SgYjq3t8ULX7P1xkwqHslqjgG/kroMYXZ8CIdNnUlUFIX+/EyYnHKGKdkJq/BGOLl2hHsAPXB+ugB3yrPssoEImJhMawNF0RT9yUonVLmMRxsmYvc4RF8nitKmd5vcWwDfssSF+ezmpTnsifG/rce0W4bHZOILhg+GgTeS93Pv2zIiHwL2ntefgmDba/4az1+/HOZbD2nbb9d+tXDyWpeRLmyjIrHXD01X9vi2bz+rEnH8V0VMaZiUPMkUabl8maCvGT0/ZQL2YzKYArQcjLf/c13IbsNPJQH5VY04nr+pBRRvifKVAxKJ/ChC558C5Qo86xNQLUa3xGkhuOoJQwM+XiG2IMMfDVQiQDvtZIoY1aL5DB5xSb3dUOlUzNo7K2XNuCl3Tyw7YV2eB4NZHUgiF/2aM/2+M6Dr1r1Gn8Eb10kqVk7QZ5wUIUXhJfplK55h1TiWb3XEr59OITDJHfQ4FYYYJri4TEwFNOVQE3tQAnnJ7ErB8UlOORZA3rJqXQwnKjKebP/2XKYa7I6o5Vj5OPGVDaE73sjumNr4TupUOvqlBDWTHk/5citK4NaZg3hsBTca3K7XTU3wJFNpezClh6f/I3GLI1Rs5IrNceHxy8rRH3qH+Dqd2ETM/06r4WTh5HLOjijHZgOOrubbbnEa4ecgDASHwuuz85Torg5jTIXrxpXK1RB14wiPGEg7XGdCBzZFg0wnEVXP86JxzImLcqFQO2RaI1czq7QV8mUdf4CX9z58aY93orwZ5rIDlHppr5RN+Mf9JwtY6Ku08HG+vpT9fcgKCqJfd1t90Mr+fT65mmB3k+cvvBwkYZwY28pkjQ2J+Cqrbf/LlFPaVRUCQ2bDjd7PnSqsLDwe8UCAZ9+p849cia2AIVvrhxkeQ/McE7Gmp3/+THqxVYEuXy3WIsfnfnCFxfIg3a59VBDdKhde/22nP0pHbIj1mENe2H6hjwVoWL83oGQ30AcHxwGdoMjjBq0PrcnAx67ew8E5HPA0egkO1Cfmo8o9TJAXGX5adK41Kc7lyCW76pIiAwKn0OT+Y8uQfWTcvAcIz/JkUTMo48qx4ijbA8lNQOkzuOCe09Rx+kX400f+9LmSzaXJNYMj9nFVA5NvdoAdTaTOtRJnePY3Ge93+yTeJJvf0WWJGdt9qqprZRBxsx1ETyWpl7BxYCLlJhhmVI2ok81AJWjMsGiPCjrFU3mfp0+5ArT5VTIxPWMmEhDBxIz7+dgCmk3GBC21Kgsw/oHJJUaxYZ6Mr4x9FlD0+JDrROZRWw4RLxNQAe8fTMWfd4U3f+f8rmguPBwGk8akK46jZFiZK9HOgwF1KIRm0RspPculg8E6Odh6L9RQF1MePmZZax/FAk1DNrQKx3ozbDJNEOfq5WAzY83tqP/fDiC9PdMfT/SrxwJhhEmD8+gko2gVPZHu6E6tSrA6RKrU/91HTTTHngZ5FTGOVGiWFIS0rp9BR2DGAAAA==',
        },
      },
      {
        title: '维基百科迎来25周年', date: '2026-01-15',
        text: '维基媒体基金会启动周年计划，用一组短纪录片记录志愿者，回顾这部面向公众开放的协作百科如何累积知识。',
        source: '维基媒体基金会',
        url: 'https://wikimediafoundation.org/news/2026/01/15/wikipedia-celebrates-25years/',
      },
      {
        title: '铁路春运首日车票开售', date: '2026-01-19',
        text: '铁路部门开始发售2月2日春运首日火车票。铁路12306同日推出限时免费误购退票服务，在满足条件时可在线自助办理。',
        source: '上海市人民政府门户网站',
        url: 'https://www.shanghai.gov.cn/nw17239/20260122/259f0983276b44dca437c05d56b76966.html',
      },
    ],
  },
  {
    month: 2,
    items: [
      {
        title: '米兰—科尔蒂纳冬奥会开幕', date: '2026-02-06',
        text: '第25届冬季奥林匹克运动会在意大利开幕。开幕式在米兰圣西罗体育场举行，冰雪项目分布在米兰、科尔蒂纳等多个赛区。',
        source: '国际奥委会',
        url: 'https://www.olympics.com/ioc/news/ioc-president-s-speech-milano-cortina-2026-olympic-winter-games-opening-ceremony',
        image: {
          credit: 'ERIC SALARD · CC BY-SA 4.0 · 缩小转码',
          alt: '冬奥开幕日的圣西罗体育场与开幕式舞台',
          page: 'https://commons.wikimedia.org/wiki/File:OLYMPIC_OPENING_CEREMONY_MILANO-CORTINA_2026_STADIO_SAN_SIRO.jpg',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
          url: 'data:image/webp;base64,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',
        },
      },
      {
        title: '马年春晚《武BOT》与人形机器人', date: '2026-02-16',
        text: '马年春晚在除夕夜播出。《武BOT》把人形机器人的动作编排和中华武术放进同一个节目，《奶奶的最爱》则借小品想象机器人走进日常生活。',
        source: '中央广播电视总台',
        url: 'https://www.cctv.cn/2026/02/17/ARTIDsVtV7sKx9pANgdvLIim260217.shtml',
      },
    ],
  },
  {
    month: 3,
    items: [
      {
        title: '十四届全国人大四次会议开幕', date: '2026-03-05',
        text: '会议在北京人民大会堂开幕。与会代表听取政府工作报告，会议议程包括审查国民经济和社会发展第十五个五年规划纲要草案。',
        source: '新华社 · 中国网信网转载',
        url: 'https://www.cac.gov.cn/2026-03/05/c_1774443732461953.htm',
      },
      {
        title: '在上海崇明种下一棵树', date: '2026-03-12',
        text: '第48个植树节当天，上海新纪元学校400多名师生在东平国家森林公园种植水杉，也参与树木养护。',
        source: '上海市崇明区人民政府',
        url: 'https://www.shcm.gov.cn/xwzx/002003/20260312/cbbfc88a-d69a-40e9-9aee-c250c8c23eed.html',
      },
    ],
  },
  {
    month: 4,
    items: [
      {
        title: '阿耳忒弥斯二号乘员返回地球', date: '2026-04-10',
        text: '猎户座飞船完成载人绕月飞行，四名乘员在美国加利福尼亚州外海溅落返回。这次飞行于4月1日从美国佛罗里达州发射。日期采用当地时间。',
        source: '美国国家航空航天局',
        url: 'https://www.nasa.gov/mission/artemis-ii/',
        image: {
          credit: 'NASA / James Blair · 美国公有领域 · 缩小转码',
          alt: '阿耳忒弥斯二号猎户座飞船在三具降落伞牵引下飞近太平洋',
          page: 'https://commons.wikimedia.org/wiki/File:Artemis_II_Splashdown_(KSC-20260410-PH-JMB01_0001).jpg',
          licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
          url: 'data:image/webp;base64,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',
        },
      },
      {
        title: '中国航天日科普展开幕', date: '2026-04-24',
        text: '成都迎来中国航天日主场科普展。公众可以看到嫦娥五号、嫦娥六号带回的月球样品，也可以近距离参观天和核心舱等比例模型。',
        source: '国家航天局',
        url: 'https://www.cnsa.gov.cn/n6758823/n6758844/n10740300/n10740333/c10742480/content.html',
      },
    ],
  },
  {
    month: 5,
    items: [
      {
        title: '天舟十号货运飞船发射', date: '2026-05-11',
        text: '长征七号遥十一运载火箭从文昌发射场升空，把天舟十号送入预定轨道。分离后，飞船太阳能帆板按计划展开。',
        source: '中国载人航天工程网',
        url: 'https://www.cmse.gov.cn/xwzx/202605/t20260511_57456.html',
      },
      {
        title: '国际博物馆日中国主会场开幕', date: '2026-05-18',
        text: '内蒙古博物院举行国际博物馆日中国主会场活动。《金玉华光 多彩中华》展览同期揭幕，现场还发布上一年度陈列展览精品。',
        source: '文化和旅游部',
        url: 'https://www.mct.gov.cn/wlbphone/wlbydd/xxfb/qglb/qg/202605/t20260519_965876.html',
      },
    ],
  },
  {
    month: 6,
    items: [
      {
        title: '美加墨世界杯揭幕战', date: '2026-06-11',
        text: '墨西哥城迎来世界杯揭幕战。东道主之一墨西哥以2比0击败南非。本届比赛由加拿大、墨西哥和美国共同举办。日期采用当地时间。',
        source: '国际足联',
        url: 'https://www.fifa.com/es/tournaments/mens/worldcup/canadamexicousa2026/articles/videos-goles-mexico-sudafrica-highlights-resumen',
      },
      {
        title: '文化和自然遗产日走进武汉', date: '2026-06-13',
        text: '文化和自然遗产日主场城市活动在武汉举办。“寻绎夏商”主题展览揭幕，会期还设有文物科技创新论坛。',
        source: '湖北省人民政府',
        url: 'https://www.hubei.gov.cn/zwgk/hbyw/hbywqb/202606/t20260613_5957383.shtml',
      },
    ],
  },
  {
    month: 7,
    items: [
      {
        title: '世界人工智能大会在上海开幕', date: '2026-07-17',
        text: '大会在上海开幕，展览从世博、张江延伸到西岸。机器人把动作演示带到展厅，展品还覆盖算力和人工智能应用。',
        source: '上海市浦东新区人民政府',
        url: 'https://www.shanghai.gov.cn/nw15343/20260722/4514c99cfd364c3ba7d1b81790a09163.html',
      },
      {
        title: '世界遗产委员会第48届会议', date: '2026-07-19',
        text: '世界遗产委员会在韩国釜山举行第48届会议，审议新申报项目及既有遗产的保护状况。公众可以回看会议直播录像。',
        source: '联合国教科文组织世界遗产中心',
        url: 'https://whc.unesco.org/en/sessions/48COM/',
      },
      {
        title: '国际数学奥林匹克在上海闭幕', date: '2026-07-20',
        text: '第67届国际数学奥林匹克竞赛在上海中学闭幕。来自逾110个国家和地区的近700名参赛者围绕六道数学题展开较量。',
        source: '国际数学奥林匹克组委会',
        url: 'https://www.imo-official.org/news/imo-2026-concludes-in-shanghai/',
      },
    ],
  },
  {
    month: 8,
    items: [
      {
        title: '贵州村超冠军赛收官', date: '2026-08-02',
        text: '贵州村超冠军赛总决赛在榕江举行。全省9个市州的队伍从5月起分阶段参赛，各地主场也把本地民俗表演搬进了球场。',
        source: '国家体育总局 · 中国体育报',
        url: 'https://www.sport.gov.cn/n14471/n14495/n14543/c29822118/content.html',
      },
      {
        title: '北半球迎来日全食', date: '2026-08-12',
        text: '月球遮住太阳，月影扫过格陵兰、冰岛和西班牙等地。全食带内的观测者在短暂变暗的天空下看到了太阳外层的日冕。',
        source: '美国国家航空航天局 · 每日天文图',
        url: 'https://science.nasa.gov/image-article/apod-2026-august-13-total-solar-eclipse-over-spain/',
        image: {
          credit: 'Lminoza · CC BY-SA 4.0 · 缩小转码',
          alt: '西班牙比利亚达的日全食，黑色月面周围可见日冕',
          page: 'https://commons.wikimedia.org/wiki/File:2026_August_12_Eclipse.jpg',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
          url: 'data:image/webp;base64,UklGRooCAABXRUJQVlA4IH4CAAAQFwCdASr6AKYAPp1OpE2lpKejIZgIiPATiWlu3V8oLbQqfAqDGSxsw+bB2zIJk7ZhgR/zQ9BKMlh6L37FeCenMtYb3eUuYoYvQfXLGveYcV2B6DDWGNqKYYjKBQYmUEbEgyXWwFKzrCoUDBXziyWAKJ3h7iq9dLuHD1aQtF57tlDLjvbXBGhmozhgPFLshnxib6vVIgN3DZ07p8JWpeDDFo+1duDs3n69toNUT3CHJ0PYIVrJTsZLse6LNlvqQhAAAP73oxPxsD6c2RrKLE499IGEi2Wvt1lWbU7wEjNY80rIqdmKlN0qCLnAnpYHQLr6P6S9a1jt7R2ao/fBe/GtayQzx7V4hoBBlPCwYrAn4bU9V/aode75H6gGAg/POv4k8NBge6XPgDwFuqyI/flGjI/c01M5/dSh1+aB5oTWwou/U7Mvp1zVOVFaG5kJ04hnJcQtwO6L+HTUerqivZZJZZzvZmM4tNz5sx7j2xWTYsZn1E3Rj+gJ7cW3qihZ5tT7XK4uYW/V3Anr1v3AFSO1UvgjHoqilgTPnZmA7jKfO3bqjGubXrmRO2YVzzkqcYT+TqNvSAPe/AY0G4bm3tJpH/E3mSdu8IA/1BQ48sCoP8NWNhGc1at1ueTD3SgJgXFhkCN7/3TlxwRs8XVvgRd7J+OHu3O9MNnhy8qieIm9Txj4a6DlVIvodpQIW1o7UVcXAHalgWelCDwrtr3egcLbec6+to95X8ycjvfoGgN4HHDZ8mxKgDvCR1yD00Iy0unvpu1D5Ovar/OlfTT7jPlWOOy91whh7pz70Nedcke3KGtcf2NmDSWfiRYckKgyjOqm4P9qPwlkqabXiloQAA==',
        },
      },
    ],
  },
  {
    month: 9,
    items: [
      {
        title: '国家网络安全宣传周在济南开幕', date: '2026-09-14',
        text: '宣传周开幕式在济南举办。会场设网络安全技术应用体验区，围绕人工智能安全和日常网络安全防护开展活动。',
        source: '中国网信网',
        url: 'https://www.cac.gov.cn/2026-09/14/c_1791137133265127.htm',
      },
      {
        title: '爱知—名古屋亚运会开幕', date: '2026-09-19',
        text: '第20届亚洲运动会开幕式在日本名古屋举行。本届设置43个大项，虚拟跆拳道等项目首次出现在亚运赛场。',
        source: '国家体育总局 · 中国体育报',
        url: 'https://www.sport.gov.cn/n4/n30039867/n30039923/c30055543/content.html',
      },
    ],
  },
  {
    month: 10,
    items: [
      {
        title: '国庆假期的国内出游', date: '2026-10-09',
        text: '文化和旅游部发布国庆假期数据。七天假期国内出游8.26亿人次，赏秋、乡村夜游、非遗体验和户外演出成为假期活动的一部分。',
        source: '文化和旅游部',
        url: 'https://www.mct.gov.cn/whzx/whyw/202610/t20261009_967315.htm',
      },
      {
        title: '第140届广交会开幕', date: '2026-10-15',
        text: '创办70周年的广交会在广州开启第140届展览。第一期聚焦先进制造，集中展示人工智能、绿色低碳等领域的展品与应用。',
        source: '商务部',
        url: 'https://www.mofcom.gov.cn/xwfbzt/2026/swbzklxxwfbh2026n10y15r/index.html',
      },
    ],
  },
  {
    month: 11,
    items: [
      {
        title: '乌镇“互联网之光”开幕', date: '2026-11-02',
        text: '乌镇“互联网之光”博览会设六个主题展区，展示大模型、具身智能、卫星互联网等技术和应用，来自54个国家和地区的机构和企业参与。',
        source: '中国网信网',
        url: 'https://www.cac.gov.cn/2026-11/02/c_1795373863477368.htm',
      },
      {
        title: '第九届进博会在上海开幕', date: '2026-11-05',
        text: '第九届中国国际进口博览会在国家会展中心（上海）开幕。共有4,142家境外企业参展，整体展览面积首次超过44万平方米。',
        source: '新华社',
        url: 'https://www.xinhuanet.com/20261105/b2e5693640e849e0bb7606c98ff01764/c.html',
      },
    ],
  },
  { month: 12, items: [] },
];
