import machine
import time

relay = machine.Pin(15, machine.Pin.OUT, value=1)  # start HIGH (relay OFF)

time.sleep(1)        # short settle time after boot

relay.value(1)       # LOW → relay ON → pump runs
time.sleep(10)
relay.value(0)       # HIGH → relay OFF → pump stops