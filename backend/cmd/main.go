package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"scribble/backend/api"
	"syscall"
	"time"
)

func main() {
	log.SetFlags(0)

	err := run()
	if err != nil {
		log.Fatal(err)
	}
}

func run() error {
	if len(os.Args) < 2 {
		return errors.New("please provide an address to listen on as the first argument")
	}

	l, err := net.Listen("tcp", os.Args[1])
	if err != nil {
		return err
	}
	log.Printf("listening on http://%v", l.Addr())

	ss := api.NewScribbleServer()

	// Reclaim lobbies that were created but never joined. This has to run in
	// process: the rooms live in this server's memory, so an OS cron job
	// could not see them.
	sweep := time.NewTicker(time.Hour)
	defer sweep.Stop()
	go func() {
		for range sweep.C {
			ss.Sweep(time.Hour)
		}
	}()

	s := &http.Server{
		Handler: ss,
		// No Read/WriteTimeout: they would cut off live websocket
		// connections on /scribble. Headers still get a deadline.
		ReadHeaderTimeout: time.Second * 10,
	}
	errc := make(chan error, 1)
	go func() {
		errc <- s.Serve(l)
	}()

	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, os.Interrupt, syscall.SIGTERM)
	select {
	case err := <-errc:
		log.Printf("failed to serve: %v", err)
	case sig := <-sigs:
		log.Printf("terminating: %v", sig)
	}

	// http.Server.Shutdown neither closes nor waits for hijacked connections,
	// so the websockets have to be closed here or clients just see the TCP
	// connection vanish.
	ss.Close()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
	defer cancel()

	return s.Shutdown(ctx)
}
