# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e6]:
    - heading "Sign in" [level=1] [ref=e7]
    - textbox "Email" [ref=e8]: gsmeade11@gmail.com
    - textbox "Password" [ref=e9]: changeme
    - paragraph [ref=e10]: Invalid email or password
    - button "Sign in" [ref=e11]
    - paragraph [ref=e12]:
      - text: No account?
      - link "Create one" [ref=e13] [cursor=pointer]:
        - /url: /register
  - region "Notifications alt+T"
  - alert [ref=e14]
```