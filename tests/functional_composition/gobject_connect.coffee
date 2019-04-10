button.connect(
  "clicked",
  () => doSomething()
)
app.connect(
  "activate",
  () =>
    await data.load()
    win.show_all()
)
